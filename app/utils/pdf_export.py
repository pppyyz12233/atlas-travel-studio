import logging

logger = logging.getLogger(__name__)

# ────────────────────────────────────────────────────────────
# PDF 渲染链（能力从高到低逐级降级；正文一律来自同一 finalReply，
# 与 Markdown 导出同源——PDF 仅额外加"旅行方案—目的地/日期"抬头与页脚页码）：
# 1. weasyprint  —— 完整 HTML/CSS 排版（本机未装，装上后自动启用）
# 2. xhtml2pdf   —— HTML→PDF：保留标题/表格/列表/链接，文本可选中复制
#                   （reportlab CID 字体 STSong-Light，中文免字体文件）
# 3. matplotlib  —— 纯文本逐行排版：中文正常、多页不截断、标题加大加粗、带页码；
#                   限制：表格退化为竖线文本、超宽行按 46 字符换行、文本不可复制
# 4. plain ASCII —— 最后保底，中文变 '?'（仅在前三级全部不可用时）
# ────────────────────────────────────────────────────────────


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


def _space_long_cjk_runs(md_text: str, threshold: int = 120, chunk: int = 60) -> str:
    """无空格连续 CJK 超长行的换行守卫。

    reportlab 对不带空格的连续 CJK 只能整体作为一个可断单元，
    数千字的单行会被 keep-in-frame 压缩到一页（视觉不可读）。
    超过 threshold 的行每 chunk 字符插一个空格作为断点——
    对正常 Markdown 无影响（正常行远短于阈值），复制文本多出的空格无害。
    """
    lines = md_text.split("\n")
    for index, line in enumerate(lines):
        if len(line) > threshold and " " not in line and "|" not in line:
            lines[index] = " ".join(line[i:i + chunk] for i in range(0, len(line), chunk))
    return "\n".join(lines)


def html_to_pdf_xhtml2pdf(body_html: str, destination: str = "") -> bytes:
    """HTML → PDF（xhtml2pdf + reportlab CID 中文字体）。

    保留 Markdown 转出的标题层级/表格/列表/链接，文本可选中复制；
    A4 版式 + 页脚页码。weasyprint 不可用时的首选降级。
    """
    import io

    from xhtml2pdf import pisa
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.cidfonts import UnicodeCIDFont

    try:
        pdfmetrics.registerFont(UnicodeCIDFont("STSong-Light"))
        cjk_font = "STSong-Light"
    except Exception:
        cjk_font = "Helvetica"

    header_line = f"Atlas · {destination}" if destination else "Atlas"
    document = f"""<html><head><style>
      @page {{
        size: A4; margin: 16mm 14mm 20mm 14mm;
        @frame footer_frame {{ -pdf-frame-content: footerContent; left: 40pt; width: 515pt; top: 800pt; height: 28pt; }}
      }}
      body {{ font-family: {cjk_font}; font-size: 11px; line-height: 1.65; color: #1a1a1a; }}
      h1 {{ font-size: 18px; margin: 10pt 0 6pt; }}
      h2 {{ font-size: 15px; margin: 9pt 0 5pt; }}
      h3 {{ font-size: 13px; margin: 8pt 0 4pt; }}
      h4 {{ font-size: 12px; margin: 7pt 0 4pt; }}
      table {{ border: 0.5pt solid #999; margin: 4pt 0; }}
      th {{ background-color: #f2efe9; }}
      td, th {{ border: 0.5pt solid #999; padding: 3pt 6pt; font-size: 10px; }}
      li {{ margin: 2pt 0; }}
      hr {{ color: #bbb; }}
      blockquote {{ color: #555; margin: 4pt 0 4pt 8pt; }}
    </style></head><body>
    {body_html}
    <div id="footerContent" style="text-align: center; font-size: 9px; color: #888888;">
      {header_line} · 第 <pdf:pagenumber /> 页 / 共 <pdf:pagecount /> 页
    </div>
    </body></html>"""

    buffer = io.BytesIO()
    status = pisa.CreatePDF(document, dest=buffer, encoding="utf-8")
    if status.err:
        raise RuntimeError(f"xhtml2pdf 渲染失败: {status.err} 处错误")
    return buffer.getvalue()


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


def cjk_text_pdf(md_text: str, destination: str = "") -> bytes:
    """matplotlib 后端的纯文本 PDF（第三级降级）。

    保证：中文正常、多页不截断、# 标题加大加粗、页脚页码、换行不产生孤立的 '-'。
    限制（代码与页面均需如实说明）：表格退化为竖线文本、文本不可复制、无链接。
    """
    import io

    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    from matplotlib.backends.backend_pdf import PdfPages

    family = _resolve_cjk_font()
    # 中文无空格不可自动换行：按固定列宽软换行，避免右侧截断；
    # 表格分隔行（|---|---|）换行后可能残留孤立 '-'，跳过纯 '-' 行
    wrapped: list[tuple[str, int, int]] = []  # (文本, 字号, 是否加粗)
    for raw in md_text.splitlines():
        stripped = raw.strip()
        if not stripped:
            wrapped.append(("", 9.5, False))
            continue
        heading = 0
        bold = False
        if stripped.startswith("#"):
            heading = min(stripped.count("#", 0, 6), 4)
            stripped = stripped.lstrip("# ").strip() or stripped
        bold = heading > 0
        size = {1: 15, 2: 13, 3: 11.5, 4: 10.5}.get(heading, 9.5)
        pieces = [stripped[i:i + 46] for i in range(0, len(stripped), 46)] or [""]
        for piece in pieces:
            text = piece.rstrip() if piece.strip("- ") == "" and piece.strip() else piece
            if text.strip() in ("-", "|-"):
                continue
            wrapped.append((text, size, bold))

    lines_per_page = 46
    header_line = f"Atlas · {destination}" if destination else "Atlas"
    buf = io.BytesIO()
    with PdfPages(buf) as pdf:
        total_pages = max(1, -(-len(wrapped) // lines_per_page))
        for page in range(total_pages):
            chunk = wrapped[page * lines_per_page:(page + 1) * lines_per_page]
            fig = plt.figure(figsize=(8.27, 11.69))
            # 逐行绘制以支持标题字号/加粗
            y = 0.965
            for text, size, bold in chunk:
                if text:
                    fig.text(
                        0.06, y, text,
                        fontsize=size, family=[family] if family else [],
                        fontweight="bold" if bold else "normal",
                        va="top", color="#1a1a1a",
                    )
                y -= (size * 1.62) / 842
            fig.text(0.5, 0.025, f"{header_line} · 第 {page + 1} 页 / 共 {total_pages} 页",
                     fontsize=8.5, family=[family] if family else [],
                     ha="center", color="#888888")
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


def render_plan_pdf(md_text: str, destination: str = "") -> bytes:
    """统一 PDF 渲染入口：weasyprint → xhtml2pdf → matplotlib → ASCII。

    所有导出路径（登录/游客）都走这里，保证任何环境都返回 %PDF- 字节。
    正文与 Markdown 导出同源（finalReply），PDF 仅额外加抬头与页脚页码。
    """
    try:
        return html_to_pdf(markdown_to_html(md_text))
    except ImportError:
        pass
    try:
        return html_to_pdf_xhtml2pdf(markdown_to_html(_space_long_cjk_runs(md_text)), destination)
    except Exception:
        logger.warning("xhtml2pdf 渲染失败，退回 matplotlib 纯文本 PDF", exc_info=True)
    try:
        return cjk_text_pdf(md_text, destination)
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
