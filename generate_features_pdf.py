from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.lib.colors import HexColor, white, black
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable
from reportlab.lib.enums import TA_LEFT, TA_CENTER

OUT = "InfoHub_New_Features_June2026.pdf"

W, H = A4
margin = 18 * mm

doc = SimpleDocTemplate(
    OUT,
    pagesize=A4,
    leftMargin=margin,
    rightMargin=margin,
    topMargin=14 * mm,
    bottomMargin=14 * mm,
    title="InfoHub — New Features",
    author="InfoHub Dev",
)

# Colours
DARK  = HexColor("#0f1117")
CARD  = HexColor("#1a1d27")
ACCENT = HexColor("#6366f1")   # indigo
GREEN  = HexColor("#22c55e")
CYAN   = HexColor("#06b6d4")
ORANGE = HexColor("#f97316")
PURPLE = HexColor("#a855f7")
YELLOW = HexColor("#eab308")
MUTED  = HexColor("#94a3b8")
LIGHT  = HexColor("#e2e8f0")

styles = getSampleStyleSheet()

def S(name, **kw):
    base = styles[name] if name in styles else styles["Normal"]
    return ParagraphStyle(name + "_custom_" + str(id(kw)), parent=base, **kw)

title_style = S("Title",
    fontSize=26, leading=32, textColor=LIGHT,
    fontName="Helvetica-Bold", spaceAfter=2, alignment=TA_CENTER)

sub_style = S("Normal",
    fontSize=10, leading=14, textColor=MUTED,
    fontName="Helvetica", spaceAfter=0, alignment=TA_CENTER)

section_style = S("Heading2",
    fontSize=13, leading=17, textColor=ACCENT,
    fontName="Helvetica-Bold", spaceBefore=14, spaceAfter=6)

feature_title_style = S("Normal",
    fontSize=11, leading=14, textColor=LIGHT,
    fontName="Helvetica-Bold")

feature_body_style = S("Normal",
    fontSize=9, leading=13, textColor=MUTED,
    fontName="Helvetica")

tag_style = S("Normal",
    fontSize=7.5, leading=10, textColor=white,
    fontName="Helvetica-Bold")

footer_style = S("Normal",
    fontSize=8, leading=11, textColor=MUTED,
    fontName="Helvetica", alignment=TA_CENTER)

story = []

# ── Header ────────────────────────────────────────────────────────────────────
story.append(Spacer(1, 4 * mm))
story.append(Paragraph("InfoHub", title_style))
story.append(Paragraph("What's New — June 2026 Release", sub_style))
story.append(Spacer(1, 3 * mm))
story.append(HRFlowable(width="100%", thickness=1, color=ACCENT, spaceAfter=8))

# ── Feature data ──────────────────────────────────────────────────────────────
sections = [
    {
        "title": "New Pages",
        "color": GREEN,
        "features": [
            {
                "tag": "NEW PAGE",
                "tag_color": GREEN,
                "title": "Daily Digest  /today",
                "body": (
                    "One-page snapshot of everything moving the market right now: key prices "
                    "with 24h change, Fear &amp; Greed index, BTC dominance, 24h liquidation totals, "
                    "highest/lowest funding rates, OI surges &amp; dumps, top movers, and up to 3 "
                    "algorithmic trade ideas. Auto-refreshes every 5 minutes. "
                    "Share button copies a Telegram-ready text summary with one tap."
                ),
            },
            {
                "tag": "NEW PAGE",
                "tag_color": GREEN,
                "title": "DEX Whale Tracker  /whales",
                "body": (
                    "Real-time fills above your chosen size threshold ($50K to $1M+) from "
                    "Hyperliquid (live WebSocket) and dYdX (5-second poll). "
                    "Filter by 14 coins: BTC, ETH, SOL, ARB, DOGE, AVAX, LINK, SUI, OP, NEAR, APT, WIF, PEPE, TIA. "
                    "Live buy/sell flow bar updates in real time. No login required."
                ),
            },
        ],
    },
    {
        "title": "Upgrades to Existing Pages",
        "color": CYAN,
        "features": [
            {
                "tag": "UPGRADED",
                "tag_color": CYAN,
                "title": "Smart Money  /watch",
                "body": (
                    "Suggested wallet count increased from 8 to 12 — pulls the top performers "
                    "from both Hyperliquid and GMX leaderboards so you have more quality addresses "
                    "to add with a single click."
                ),
            },
            {
                "tag": "UPGRADED",
                "tag_color": CYAN,
                "title": "Signals  /signals",
                "body": (
                    "Added Telegram community call-to-action. "
                    "OI surge &amp; dump detection now runs on both 1h and 4h windows, "
                    "giving earlier and more reliable breakout signals."
                ),
            },
            {
                "tag": "UPGRADED",
                "tag_color": CYAN,
                "title": "Screener  /screener",
                "body": (
                    "Controls row split into two rows for mobile: search + filter toggle on top, "
                    "quick-preset tabs (scrollable) below. No more wrapping or hidden buttons "
                    "on narrow screens."
                ),
            },
            {
                "tag": "UPGRADED",
                "tag_color": CYAN,
                "title": "Home Page",
                "body": (
                    "Added live MarketPulse ticker strip above the fold and a DEX Whales "
                    "activity card. New community section with Telegram invite."
                ),
            },
        ],
    },
    {
        "title": "Navigation & Discovery",
        "color": PURPLE,
        "features": [
            {
                "tag": "UX",
                "tag_color": PURPLE,
                "title": "Sidebar — new pages wired in",
                "body": (
                    "Daily Digest added to the 'Start Here' group. "
                    "DEX Whale Tracker added to the 'Smart Money' group. "
                    "Both show a NEW badge."
                ),
            },
            {
                "tag": "UX",
                "tag_color": PURPLE,
                "title": "What's New popover updated",
                "body": (
                    "Changelog entry for June 21 session lists Daily Digest, DEX Whale Tracker, "
                    "Smart Money expansion, and Screener mobile fix."
                ),
            },
            {
                "tag": "UX",
                "tag_color": PURPLE,
                "title": "FAQ updated",
                "body": (
                    "Two new entries in the Data &amp; Features section: "
                    "'What is the Daily Digest?' and 'What is the DEX Whale Tracker?'"
                ),
            },
        ],
    },
    {
        "title": "Telegram Alerts",
        "color": HexColor("#229ED9"),
        "features": [
            {
                "tag": "ALERTS",
                "tag_color": HexColor("#229ED9"),
                "title": "Daily briefing now broadcasts to public channel",
                "body": (
                    "The 08:00 UTC Telegram digest is now sent to the public InfoHub channel "
                    "in addition to individual subscribers."
                ),
            },
            {
                "tag": "ALERTS",
                "tag_color": HexColor("#229ED9"),
                "title": "Critical funding signal broadcast",
                "body": (
                    "Extreme funding rates (above +0.1% or below -0.05%) now trigger "
                    "a broadcast message to the public channel, not just private alerts."
                ),
            },
            {
                "tag": "ALERTS",
                "tag_color": HexColor("#229ED9"),
                "title": "Daily Digest share — Copy Text button",
                "body": (
                    "On /today, the share panel now includes a blue 'Copy text' button that "
                    "puts a fully-formatted Telegram markdown summary on your clipboard, "
                    "ready to paste into any group."
                ),
            },
        ],
    },
]

# ── Render sections ────────────────────────────────────────────────────────────
for section in sections:
    story.append(Paragraph(section["title"], section_style))

    for feat in section["features"]:
        tc = feat["tag_color"]
        # Tag pill as a tiny 1-cell table
        tag_para = Paragraph(feat["tag"], tag_style)
        tag_table = Table([[tag_para]], colWidths=[22 * mm], rowHeights=[5.5 * mm])
        tag_table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), tc),
            ("ROUNDEDCORNERS", [3]),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("ALIGN",  (0, 0), (-1, -1), "CENTER"),
            ("TOPPADDING",    (0, 0), (-1, -1), 1),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 1),
        ]))

        title_para = Paragraph(feat["title"], feature_title_style)
        body_para  = Paragraph(feat["body"],  feature_body_style)

        # Row: [tag | title]  then body below
        header_row = Table(
            [[tag_table, title_para]],
            colWidths=[24 * mm, (W - 2 * margin - 24 * mm)],
        )
        header_row.setStyle(TableStyle([
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("LEFTPADDING",  (0, 0), (-1, -1), 0),
            ("RIGHTPADDING", (0, 0), (-1, -1), 0),
            ("TOPPADDING",   (0, 0), (-1, -1), 0),
            ("BOTTOMPADDING",(0, 0), (-1, -1), 0),
        ]))

        card_content = Table(
            [[header_row], [body_para]],
            colWidths=[W - 2 * margin - 10 * mm],
        )
        card_content.setStyle(TableStyle([
            ("LEFTPADDING",  (0, 0), (-1, -1), 0),
            ("RIGHTPADDING", (0, 0), (-1, -1), 0),
            ("TOPPADDING",   (0, 0), (-1, -1), 2),
            ("BOTTOMPADDING",(0, 0), (-1, -1), 3),
        ]))

        card = Table(
            [[card_content]],
            colWidths=[W - 2 * margin],
        )
        card.setStyle(TableStyle([
            ("BACKGROUND",    (0, 0), (-1, -1), CARD),
            ("ROUNDEDCORNERS",[6]),
            ("LEFTPADDING",   (0, 0), (-1, -1), 5 * mm),
            ("RIGHTPADDING",  (0, 0), (-1, -1), 5 * mm),
            ("TOPPADDING",    (0, 0), (-1, -1), 3.5 * mm),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 3.5 * mm),
            ("BOX", (0, 0), (-1, -1), 0.5, HexColor("#2d3148")),
        ]))

        story.append(card)
        story.append(Spacer(1, 3 * mm))

# ── Footer ────────────────────────────────────────────────────────────────────
story.append(Spacer(1, 4 * mm))
story.append(HRFlowable(width="100%", thickness=0.5, color=HexColor("#2d3148"), spaceAfter=6))
story.append(Paragraph("info-hub.io  ·  June 21, 2026  ·  All features live on production", footer_style))

def dark_bg(canvas, doc):
    canvas.saveState()
    canvas.setFillColor(DARK)
    canvas.rect(0, 0, W, H, fill=1, stroke=0)
    canvas.restoreState()

doc.build(story, onFirstPage=dark_bg, onLaterPages=dark_bg)
print(f"Done -> {OUT}")
