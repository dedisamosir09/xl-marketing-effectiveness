MENU_ITEMS = [
    {
        "key": "campaign-performance",
        "label": "Marketing Campaign Performance",
        "short_label": "Campaign Performance",
        "path": "/campaign-performance/",
        "icon": "chart",
        "description": "Campaign delivery, engagement, conversion, and efficiency monitoring.",
    },
    {
        "key": "mta",
        "label": "Multi Touch Attribution (MTA)",
        "short_label": "Multi Touch Attribution",
        "path": "/mta/",
        "icon": "journey",
        "description": "Customer journey and touchpoint contribution analysis.",
    },
    {
        "key": "mmm",
        "label": "Marketing Mix Modeling (MMM)",
        "short_label": "Marketing Mix Modeling",
        "path": "/mmm/",
        "icon": "building",
        "description": "Incremental business impact and channel effectiveness measurement.",
    },
    {
        "key": "geo-intelligence",
        "label": "Geo Intelligence",
        "short_label": "Geo Intelligence",
        "path": "/geo-intelligence/",
        "icon": "radar",
        "description": "Geographic performance patterns and market opportunity analysis.",
    },
]


def get_menu_item(key):
    return next(item for item in MENU_ITEMS if item["key"] == key)

