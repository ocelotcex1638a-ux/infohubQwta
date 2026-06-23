import asyncio
from playwright.async_api import async_playwright
from pathlib import Path

DESKTOP = Path.home() / "Desktop" / "InfoHub_Screenshots"
DESKTOP.mkdir(exist_ok=True)

PAGES = [
    ("01_home", "https://info-hub.io/home"),
    ("02_today_daily_digest", "https://info-hub.io/today"),
    ("03_whales_dex_tracker", "https://info-hub.io/whales"),
    ("04_watch_wallets", "https://info-hub.io/watch"),
    ("05_breakout_scanner", "https://info-hub.io/breakouts"),
    ("06_screener", "https://info-hub.io/screener"),
    ("07_smart_money", "https://info-hub.io/smart-money"),
    ("08_chart", "https://info-hub.io/chart"),
]

async def screenshot_page(page, name, url):
    print(f"  {name} ...")
    try:
        await page.goto(url, wait_until="domcontentloaded", timeout=20000)
        await page.wait_for_timeout(4000)
        path = DESKTOP / f"{name}.png"
        await page.screenshot(path=str(path), full_page=False)
        print(f"  OK saved {path.name}")
        return True
    except Exception as e:
        print(f"  FAIL {name}: {e}")
        return False

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(
            viewport={"width": 1440, "height": 900},
            device_scale_factor=1,
        )
        page = await context.new_page()

        print(f"Saving screenshots to: {DESKTOP}\n")
        for name, url in PAGES:
            await screenshot_page(page, name, url)

        await browser.close()
    print("\nDone! Check Desktop/InfoHub_Screenshots")

asyncio.run(main())
