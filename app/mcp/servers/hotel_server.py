HOTELS = [
    # ── 东京 ──
    {
        "id": "H001", "name": "新宿胶囊旅馆", "city": "东京",
        "price": 380, "level": "low", "rating": 4.2,
        "location": "新宿区歌舞伎町", "desc": "地铁新宿站步行3分钟，干净卫生，适合背包客",
    },
    {
        "id": "H002", "name": "浅草和风旅馆", "city": "东京",
        "price": 450, "level": "low", "rating": 4.5,
        "location": "台东区浅草", "desc": "步行到浅草寺5分钟，传统日式风格，含早餐",
    },
    {
        "id": "H003", "name": "银座蒙特利酒店", "city": "东京",
        "price": 750, "level": "mid", "rating": 4.4,
        "location": "中央区银座", "desc": "银座商圈核心位置，地铁站直达，商务出行首选",
    },
    {
        "id": "H004", "name": "涩谷艾美酒店", "city": "东京",
        "price": 880, "level": "mid", "rating": 4.6,
        "location": "涩谷区道玄坂", "desc": "涩谷十字路口步行8分钟，年轻人的天堂",
    },
    {
        "id": "H005", "name": "东京半岛酒店", "city": "东京",
        "price": 2800, "level": "high", "rating": 4.9,
        "location": "千代田区丸之内", "desc": "正对皇居，米其林星级餐厅，顶级奢华体验",
    },

    # ── 巴黎 ──
    {
        "id": "H006", "name": "蒙马特青年旅舍", "city": "巴黎",
        "price": 320, "level": "low", "rating": 4.0,
        "location": "18区蒙马特", "desc": "步行至圣心大教堂，性价比极高",
    },
    {
        "id": "H007", "name": "拉丁区假日酒店", "city": "巴黎",
        "price": 680, "level": "mid", "rating": 4.3,
        "location": "5区拉丁区", "desc": "巴黎圣母院步行10分钟，文艺气息浓厚",
    },
    {
        "id": "H008", "name": "圣日耳曼精品酒店", "city": "巴黎",
        "price": 950, "level": "mid", "rating": 4.5,
        "location": "6区圣日耳曼", "desc": "左岸核心区域，花神咖啡馆旁",
    },
    {
        "id": "H009", "name": "香榭丽舍万豪", "city": "巴黎",
        "price": 2200, "level": "high", "rating": 4.7,
        "location": "8区香榭丽舍", "desc": "凯旋门景观房，香街购物零距离",
    },

    # ── 曼谷 ──
    {
        "id": "H010", "name": "考山路背包客栈", "city": "曼谷",
        "price": 120, "level": "low", "rating": 4.0,
        "location": "考山路", "desc": "背包客天堂，夜市热闹，机场大巴直达",
    },
    {
        "id": "H011", "name": "素坤逸宜必思", "city": "曼谷",
        "price": 280, "level": "low", "rating": 4.1,
        "location": "素坤逸路", "desc": "BTS轻轨站旁，周边餐厅按摩店密集",
    },
    {
        "id": "H012", "name": "暹罗凯宾斯基", "city": "曼谷",
        "price": 580, "level": "mid", "rating": 4.5,
        "location": "暹罗广场", "desc": "直通Siam Paragon购物中心，泳池超赞",
    },
    {
        "id": "H013", "name": "曼谷文华东方", "city": "曼谷",
        "price": 1800, "level": "high", "rating": 4.9,
        "location": "湄南河畔", "desc": "140年历史传奇酒店，河景下午茶必体验",
    },

    # ── 新加坡 ──
    {
        "id": "H014", "name": "牛车水精品酒店", "city": "新加坡",
        "price": 520, "level": "mid", "rating": 4.3,
        "location": "牛车水", "desc": "唐人街核心，美食遍地，地铁站步行5分钟",
    },
    {
        "id": "H015", "name": "滨海湾金沙", "city": "新加坡",
        "price": 2500, "level": "high", "rating": 4.8,
        "location": "滨海湾", "desc": "无边泳池地标，顶层俯瞰整个滨海湾",
    },
]


def search_hotels(city: str, budget: str = "mid") -> list[dict]:
    """按城市和预算档位搜索酒店。

    参数:
        city:   城市名（如 "东京"、"巴黎"、"曼谷"、"新加坡"）
        budget: 预算档位 —— "low"(经济) / "mid"(舒适) / "high"(豪华) / "all"(全部)

    返回:
        匹配的酒店列表，按评分从高到低排序
    """
    results = []
    for h in HOTELS:
        if h["city"] == city:
            if budget == "all" or h["level"] == budget:
                results.append(h)
    return sorted(results, key=lambda x: x["rating"], reverse=True)
