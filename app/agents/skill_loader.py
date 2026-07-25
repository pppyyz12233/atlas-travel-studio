import os

_skill_cache = {}

def load_skill(name: str) -> str:
    """load skills/{name}.md, cached. use __file__ relative path."""
    if name in _skill_cache:
        return _skill_cache[name]
    
    base = os.path.dirname(os.path.abspath(__file__))
    path = os.path.join(base, "skills", f"{name}.md")
    
    if os.path.exists(path):
        with open(path, "r", encoding="utf-8") as f:
            _skill_cache[name] = f.read()
    else:
        _skill_cache[name] = ""
    
    return _skill_cache[name]


def load_skill_or_default(name: str, default: str = "") -> str:
    """load skill, return default if empty."""
    content = load_skill(name)
    return content if content else default
