import logging

logger = logging.getLogger(__name__)


def build_markdown(reply: str, destination: str = "", dates: str = "") -> str:
    """把 aggregator 输出的 Markdown 包装成完整文档"""
    header = f"# 旅行方案 — {destination}\n\n"
    if dates:
        header += f"**日期:** {dates}\n\n"
    header += "---\n\n"
    return header + reply


def markdown_to_html(md_text: str) -> str:
    """Markdown → HTML (用于 PDF 渲染)"""
    try:
        import markdown as md_lib
        return md_lib.markdown(md_text, extensions=["tables", "fenced_code"])
    except ImportError:
        return f"<pre>{md_text}</pre>"


def _deny_external_fetch(url: str, *args, **kwargs):
    """WeasyPrint 自定义资源加载器：LLM 输出的 HTML 可能携带外链
    <img>/<link>，服务端不该替它发起网络请求（SSRF/隐私面），一律拒绝。"""
    raise ValueError(f"已禁止加载外部资源: {url}")


def html_to_pdf(html: str) -> bytes:
    """HTML → PDF bytes (使用 weasyprint，禁止加载任何外部资源)"""
    from weasyprint import HTML
    return HTML(string=html, url_fetcher=_deny_external_fetch).write_pdf()


# ── 无 WeasyPrint 环境的中文 PDF 保底 ───────────────────────
# weasyprint 在 Windows 上依赖 GTK/pango，当前环境未安装。
# matplotlib（Anaconda 自带）的 PDF 后端可内嵌系统中文字体，
# 作为第二级降级；plain_text_pdf（ASCII）是最后一级。

_CJK_FONT_CANDIDATES = (
    "Microsoft YaHei", "SimHei", "Noto Sans CJK SC",
    "Source Han Sans SC", "WenQuanYi Micro Hei", "PingFang SC",
)


def _resolve_cjk_font() -> str | None:
    """返回第一个 matplotlib 能实际解析到的中文字体名；找不到返回 None。"""
    try:
        from matplotlib.font_manager import FontProperties, findfont
    except ImportError:
        return None
    for name in _CJK_FONT_CANDIDATES:
        try:
            # fallback_to_default=False：解析不到就抛错，而不是悄悄退回 DejaVu Sans
            findfont(FontProperties(family=name), fallback_to_default=False)
            return name
        except Exception:
            continue
    return None


def cjk_text_pdf(md_text: str) -> bytes:
    """matplotlib 后端的纯文本 PDF：内嵌系统中文字体，保证中文不变成空白/问号。"""
    import io

    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    from matplotlib.backends.backend_pdf import PdfPages

    family = _resolve_cjk_font()
    # 中文无空格不可自动换行：按固定列宽软换行，避免右侧截断
    wrapped: list[str] = []
    for raw in md_text.splitlines():
        if not raw:
            wrapped.append("")
            continue
        for i in range(0, len(raw), 46):
            wrapped.append(raw[i:i + 46])

    lines_per_page = 46
    buf = io.BytesIO()
    with PdfPages(buf) as pdf:
        pages = max(1, -(-len(wrapped) // lines_per_page))
        for page in range(pages):
            chunk = wrapped[page * lines_per_page:(page + 1) * lines_per_page]
            fig = plt.figure(figsize=(8.27, 11.69))
            fig.text(
                0.06, 0.97, "\n".join(chunk),
                fontsize=9.5, family=[family] if family else [],
                va="top", linespacing=1.55, color="#1a1a1a",
            )
            pdf.savefig(fig)
            plt.close(fig)
    return buf.getvalue()


def plain_text_pdf(text: str) -> bytes:
    """最后一级保底（无 matplotlib 时的 ASCII PDF），确保永远返回可下载文件。"""
    lines = [''.join(ch if 32 <= ord(ch) < 127 else '?' for ch in line)[:110] for line in text.splitlines()[:45]] or ['Travel plan']
    content = 'BT /F1 10 Tf 40 790 Td ' + ' '.join(f'({line.replace(chr(92), chr(92)*2).replace("(", "\\(").replace(")", "\\)")}) Tj 0 -14 Td' for line in lines) + ' ET'
    objs = [b'<< /Type /Catalog /Pages 2 0 R >>', b'<< /Type /Pages /Kids [3 0 R] /Count 1 >>', b'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>', b'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>', f'<< /Length {len(content.encode())} >>\nstream\n{content}\nendstream'.encode()]
    out = bytearray(b'%PDF-1.4\n'); offsets = [0]
    for i, obj in enumerate(objs, 1): offsets.append(len(out)); out.extend(f'{i} 0 obj\n'.encode()); out.extend(obj); out.extend(b'\nendobj\n')
    xref = len(out); out.extend(f'xref\n0 {len(objs)+1}\n0000000000 65535 f \n'.encode()); out.extend(''.join(f'{off:010d} 00000 n \n' for off in offsets[1:]).encode()); out.extend(f'trailer\n<< /Size {len(objs)+1} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF'.encode()); return bytes(out)


def render_plan_pdf(md_text: str) -> bytes:
    """统一 PDF 渲染入口：weasyprint → matplotlib 中文保底 → ASCII 保底。

    所有导出路径（登录/游客）都走这里，保证任何环境都返回 %PDF- 字节。
    """
    html = markdown_to_html(md_text)
    try:
        return html_to_pdf(html)
    except ImportError:
        pass
    try:
        return cjk_text_pdf(md_text)
    except Exception:
        logger.warning("matplotlib PDF 保底失败，退回 ASCII PDF", exc_info=True)
    return plain_text_pdf(md_text)


def attachment_header(destination: str = "", dates: str = "") -> str:
    """构造 Content-Disposition：ASCII 回落名 + RFC 5987 UTF-8 文件名。

    HTTP 头只能 latin-1：中文目的地必须走 filename*=UTF-8''，
    否则 starlette 会在构造响应时抛 UnicodeEncodeError（此前游客导出 500 的根因）。
    """
    from urllib.parse import quote

    stem = "-".join(part for part in (destination.strip(), dates.strip()) if part) or "trip-plan"
    ascii_stem = "".join(
        ch if ord(ch) < 128 and (ch.isalnum() or ch in "-_") else "-"
        for ch in stem
    ).strip("-") or "trip-plan"
    return f'attachment; filename="{ascii_stem}.pdf"; filename*=UTF-8\'\'{quote(f"{stem}.pdf", safe="")}'
