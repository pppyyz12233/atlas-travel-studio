
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
