
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


def html_to_pdf(html: str) -> bytes:
    """HTML → PDF bytes (使用 weasyprint)"""
    from weasyprint import HTML
    return HTML(string=html).write_pdf()
