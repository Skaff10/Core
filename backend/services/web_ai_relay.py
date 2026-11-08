import asyncio
import os
from pathlib import Path
from typing import Dict
from core.logger import logger_bus

WEB_AI_TARGETS: Dict[str, Dict[str, str]] = {
    "chatgpt": {
        "name": "ChatGPT Web",
        "url": "https://chatgpt.com/",
        "input_selector": "#prompt-textarea, textarea",
        "response_selector": "[data-message-author-role='assistant'], .markdown",
    },
    "gemini": {
        "name": "Google Gemini Web",
        "url": "https://gemini.google.com/app",
        "input_selector": "rich-textarea div[contenteditable='true'], textarea",
        "response_selector": "message-content, .model-response-text",
    },
    "claude-web": {
        "name": "Claude Web",
        "url": "https://claude.ai/new",
        "input_selector": "div[contenteditable='true'], textarea",
        "response_selector": ".font-claude-message, [data-testid='chat-message-content']",
    },
}

USER_DATA_DIR = Path(__file__).resolve().parent.parent / ".playwright_profile"


async def relay_prompt_to_web_ai(target_key: str, prompt: str) -> str:
    """
    Uses Playwright to launch/attach to a persistent headless/background Chromium session,
    inject the user's prompt into the selected Web AI interface, and scrape the response.
    """
    target = WEB_AI_TARGETS.get(target_key.lower())
    if not target:
        return f"Unsupported Web AI target: {target_key}"

    try:
        from playwright.async_api import async_playwright
    except ImportError:
        return (
            "[PLAYWRIGHT NOT INSTALLED] Install playwright and run `playwright install chromium` "
            "on the PC backend to enable Web AI browser automation."
        )

    await logger_bus.log(
        "EXEC",
        "WEB_AI",
        f"Playwright relaying prompt to {target['name']}",
        target["url"],
    )

    try:
        USER_DATA_DIR.mkdir(parents=True, exist_ok=True)
        async with async_playwright() as p:
            context = await p.chromium.launch_persistent_context(
                user_data_dir=str(USER_DATA_DIR),
                headless=True,
                args=["--disable-blink-features=AutomationControlled"],
            )
            page = context.pages[0] if context.pages else await context.new_page()
            await page.goto(target["url"], wait_until="domcontentloaded", timeout=25000)

            try:
                input_box = await page.wait_for_selector(target["input_selector"], timeout=8000)
                if input_box:
                    await input_box.click()
                    await page.keyboard.type(prompt, delay=10)
                    await page.keyboard.press("Enter")
                    await asyncio.sleep(4.0)

                    responses = await page.query_selector_all(target["response_selector"])
                    if responses:
                        last_text = await responses[-1].inner_text()
                        await context.close()
                        return last_text.strip() or f"[{target['name']}] Response received (empty text)."
            except Exception:
                title = await page.title()
                current_url = page.url
                await context.close()
                return (
                    f"[{target['name']} // Playwright Session Active]\n"
                    f"Page Title: {title}\n"
                    f"URL: {current_url}\n"
                    f"Note: Web AI session requires an authenticated browser profile in `{USER_DATA_DIR}`. "
                    f"Sign in once via Chromium to enable live DOM prompt injection."
                )

            await context.close()
            return f"[{target['name']}] Prompt dispatched via Playwright."
    except Exception as exc:
        await logger_bus.log("ERROR", "WEB_AI", f"Playwright error ({target['name']}): {exc}")
        return f"[{target['name']} Playwright Error] {exc}"

