"""Automatic checks on the fake SillyTavern page (needs Python Playwright + Chrome).

Usage:  python3 test/run.py            (starts its own server)
Screenshots go to test/_shots/ (not committed).
"""
import os, subprocess, sys, time
from playwright.sync_api import sync_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
SHOTS = os.path.join(HERE, '_shots')
PORT = 8124
BASE = f'http://127.0.0.1:{PORT}/test/index.html'
os.makedirs(SHOTS, exist_ok=True)

fails = []


def check(cond, msg):
    print(('  ok  ' if cond else '  FAIL ') + msg)
    if not cond:
        fails.append(msg)


def open_page(browser, query='fresh', width=420, height=860):
    page = browser.new_page(viewport={'width': width, 'height': height}, device_scale_factor=2)
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.on('console', lambda m: errors.append(m.text) if m.type == 'error' and 'Failed to load resource' not in m.text else None)
    page.goto(f'{BASE}?{query}')
    page.wait_for_function('window.__mageLoaded === true')
    page.evaluate('localStorage.clear()') if 'fresh' in query else None
    return page, errors


def turn(page):
    page.evaluate('window.__fakeST.turn()'); page.wait_for_timeout(120)


def swipe(page):
    page.evaluate('window.__fakeST.swipe()'); page.wait_for_timeout(120)


def dele(page):
    page.evaluate('window.__fakeST.deleteLast()'); page.wait_for_timeout(120)


def prompt(page):
    return page.evaluate('window.__fakeST.prompt') or ''


def open_win(page):
    if page.evaluate("!document.getElementById('mage_win') || document.getElementById('mage_win').hidden"):
        page.evaluate("document.querySelector('#mage_wand').click()")


def cast(page, spell='polymorph', form=None, duration=None, target=None, more=None):
    open_win(page)
    page.click('[data-mage-view="cast"]')
    if target:
        page.select_option('[data-f="target"]', target)
    page.select_option('[data-f="spell"]', spell)
    if form:
        page.select_option('[data-f="formSel"]', form)
    if duration is not None:
        page.click(f'[data-mage-dur="{duration}"]')
    if more:
        if page.get_attribute('[data-mage-details]', 'aria-expanded') != 'true':
            page.click('[data-mage-details]')
        more(page)
    page.click('[data-mage-cast]')


def main():
    server = subprocess.Popen([sys.executable, os.path.join(HERE, 'server.py'), str(PORT)])
    time.sleep(0.8)
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(channel='chrome', args=['--no-sandbox'])

            print('1. Polymorph 3 turns: counts, swipe, delete, ends')
            page, errors = open_page(browser)
            cast(page, form='b:turtle', duration=3)
            check(page.is_visible('#mage_bar'), 'bar shows after cast')
            check('Polymorph' in page.inner_text('#mage_bar') or 'turtle' in page.inner_text('#mage_bar'), 'chip shows the form')
            turn(page)
            pr = prompt(page)
            check('Mira has just turned into a turtle' in pr, 'first reply gets the "just happened" note')
            check('react naturally' in pr, 'first reply asks for reactions')
            turn(page)
            pr = prompt(page)
            check('just turned' not in pr and '2 turns left' in pr, 'second reply: no repeat, 2 turns left')
            swipe(page)
            pr = prompt(page)
            check('2 turns left' in pr and 'just turned' not in pr, 'swipe does not count twice')
            dele(page)
            dele(page)
            dele(page)
            dele(page)
            turn(page)
            pr = prompt(page)
            check('just turned into a turtle' in pr, 'deleting the reply that showed the change sends it again')
            turn(page)
            turn(page)
            turn(page)
            pr = prompt(page)
            check('has just worn off' in pr, 'after 3 turns the end note goes out')
            turn(page)
            pr = prompt(page)
            check(pr == '', 'after the end note, nothing is sent')
            check(not page.is_visible('#mage_bar'), 'bar hides when nothing is active')
            check(not errors, f'no errors ({errors[:3]})')
            page.close()

            print('2. Stacked curse: stages, undo, swipe cancels a judgment, Dispel + undo')
            page, errors = open_page(browser)
            open_win(page)
            page.click('[data-mage-view="book"]')
            page.click('.mage-bcard [data-mage-card-load]')  # Curse of Water
            page.click('[data-mage-cast]')
            turn(page)
            check('A curse was just placed' in prompt(page), 'curse placed note')
            page.click('#mage_bar [data-mage-judge]')
            turn(page)
            pr = prompt(page)
            check('stage 1/4' in pr and 'just happened to Mira' in pr, 'stage 1 after one press')
            page.click('#mage_bar [data-mage-judge]')
            check('2/4' in page.inner_text('#mage_bar'), 'bar shows 2/4')
            page.click('#mage_bar [data-mage-undo]')
            check('1/4' in page.inner_text('#mage_bar'), 'undo takes it back to 1/4')
            page.click('#mage_bar [data-mage-judge]')
            swipe(page)
            check('1/4' in page.inner_text('#mage_bar'), 'swiping the message the press was bound to cancels it')
            page.screenshot(path=os.path.join(SHOTS, 'curse_phone.png'))
            open_win(page); page.click('[data-mage-view="status"]')
            page.click('.mage-card [data-mage-dispel]')
            turn(page)
            check('was just dispelled' in prompt(page), 'dispel note')
            page.click('[data-mage-undo]') if page.is_enabled('.mage-foot [data-mage-undo]') else None
            check(not errors, f'no errors ({errors[:3]})')
            page.close()

            print('3. Delayed / chance / condition triggers, slots, clash')
            page, errors = open_page(browser)
            def delayed(pg):
                pg.select_option('[data-f="trigKind"]', 'turns')
                pg.fill('[data-f="trigTurns"]', '2')
            cast(page, spell='mite', duration=5, more=delayed)
            turn(page)
            check('Mite' not in prompt(page), 'pending effect is not told to the AI')
            turn(page)
            turn(page)
            check('just shrunk' in prompt(page), 'fires after 2 turns')
            cast(page, spell='titan', duration=3)
            check(page.inner_text('.mage-tab.on').startswith('Cast'), 'titan on a shrunk target is refused (stays on Cast)')
            def cond(pg):
                pg.select_option('[data-f="trigKind"]', 'condition')
                pg.fill('[data-f="trigText"]', 'says "abracadabra"')
            cast(page, form='b:owl', duration=3, target='user', more=cond)
            check('abracadabra' in page.inner_text('#mage_bar'), 'condition button on the bar')
            page.click('#mage_bar [data-what="trigger"]')
            turn(page)
            check('Juno has just turned into a owl' in prompt(page), 'condition trigger fires')
            check(not errors, f'no errors ({errors[:3]})')
            page.close()

            print('4. Branch copies effects cast before the branch point')
            page, errors = open_page(browser)
            cast(page, form='b:cat', duration=0)
            turn(page)
            turn(page)
            turn(page)
            page.evaluate('window.__fakeST.branch()'); page.wait_for_timeout(150)
            check('Polymorph: is a cat' in prompt(page), 'branch keeps the cat')
            check(not errors, f'no errors ({errors[:3]})')
            page.close()

            print('5. 🎲 cause and custom form fill (fake AI)')
            page, errors = open_page(browser, 'fresh&lang=ko')
            page.evaluate("document.querySelector('#mage_wand').click()")
            page.click('[data-mage-view="cast"]')
            page.select_option('[data-f="formSel"]', 'new')
            page.fill('[data-f="formName"]', '펭귄')
            page.click('[data-mage-aiform]')
            page.wait_for_function("document.querySelector('[data-f=formCan]').value.length > 0")
            check('헤엄' in page.input_value('[data-f="formCan"]'), 'custom form filled by AI')
            page.click('[data-mage-cause]')
            page.wait_for_selector('[data-mage-cause-apply]')
            check('낡은 책' in page.inner_text('.mage-causebox') and 'hmm' not in page.inner_text('.mage-causebox'), 'cause preview (thinking removed)')
            page.click('[data-mage-cause-apply]')
            page.click('[data-mage-cast]')
            turn(page)
            check('Cause: ' in prompt(page) and '펭귄' in prompt(page), 'cause and custom form reach the AI')
            page.screenshot(path=os.path.join(SHOTS, 'ko_status.png'))
            check(not errors, f'no errors ({errors[:3]})')
            page.close()

            print('6. Screens: skins × themes × widths')
            for skin in ['theme', 'tome', 'cursed']:
                for theme in ['dark', 'light']:
                    for w, h, tag in [(390, 844, 'phone'), (1280, 860, 'pc')]:
                        for lang in ['en', 'ko']:
                            page, errors = open_page(browser, f'fresh&lang={lang}&theme={theme}', w, h)
                            page.evaluate(f"(() => {{ const s = window.__fakeST.ctx.extensionSettings.mage; s.skin = '{skin}'; }})()")
                            page.evaluate("document.querySelector('#mage_wand').click()")
                            page.click('[data-mage-view="book"]')
                            page.click('.mage-bcard [data-mage-card-load]')
                            page.click('[data-mage-cast]')
                            turn(page)
                            page.click('#mage_bar [data-mage-judge]')
                            page.click('#mage_bar [data-mage-judge]')
                            cast(page, form='b:turtle', duration=3, target='user')
                            page.wait_for_timeout(150)
                            check(page.inner_text('.mage-title b') == ('Warlock' if skin == 'cursed' else 'Mage'), f'{skin}: window title')
                            # Buttons must stay one line.
                            tall = page.evaluate("""[...document.querySelectorAll('.mage-root button')].filter(b => b.offsetParent && !b.classList.contains('mage-card-head') && b.getBoundingClientRect().height > 44).map(b => b.className + ':' + b.textContent.trim().slice(0, 20))""")
                            check(not tall, f'{skin}/{theme}/{tag}/{lang}: no tall buttons {tall[:3]}')
                            inside = page.evaluate("""(() => { const r = document.getElementById('mage_win').getBoundingClientRect(); return r.left >= 0 && r.top >= 0 && r.right <= innerWidth + 0.5 && r.bottom <= innerHeight + 0.5; })()""")
                            check(inside, f'{skin}/{theme}/{tag}/{lang}: window inside the screen')
                            page.screenshot(path=os.path.join(SHOTS, f'{skin}_{theme}_{tag}_{lang}.png'))
                            if tag == 'phone' and theme == 'dark':
                                page.click('[data-mage-view="cast"]')
                                page.click('[data-mage-details]')
                                page.screenshot(path=os.path.join(SHOTS, f'{skin}_cast_{lang}.png'), full_page=False)
                                page.click('[data-mage-view="book"]')
                                page.screenshot(path=os.path.join(SHOTS, f'{skin}_book_{lang}.png'))
                            check(not errors, f'{skin}/{theme}/{tag}/{lang}: no errors ({errors[:2]})')
                            page.close()

            print('7. Drag: title bar only, stays inside, remembers, collapse')
            page, errors = open_page(browser, 'fresh', 1280, 860)
            page.evaluate("document.querySelector('#mage_wand').click()")
            box = page.locator('.mage-head').bounding_box()
            page.mouse.move(box['x'] + 120, box['y'] + 20)
            page.mouse.down()
            page.mouse.move(box['x'] - 3000, box['y'] - 3000, steps=5)
            page.mouse.up()
            r = page.evaluate("(() => { const r = document.getElementById('mage_win').getBoundingClientRect(); return [r.left, r.top]; })()")
            check(r[0] == 0 and r[1] == 0, f'dragging past the edge stops at the edge {r}')
            page.click('[data-mage-collapse]')
            check(page.evaluate("document.getElementById('mage_win').classList.contains('mage-collapsed')"), 'collapses')
            page.goto(BASE)
            page.wait_for_function('window.__mageLoaded === true')
            page.evaluate("document.querySelector('#mage_wand').click()")
            r2 = page.evaluate("(() => { const r = document.getElementById('mage_win').getBoundingClientRect(); return [r.left, r.top, document.getElementById('mage_win').classList.contains('mage-collapsed')]; })()")
            check(r2[0] == 0 and r2[1] == 0 and r2[2], f'position and fold remembered {r2}')
            check(not errors, f'no errors ({errors[:3]})')
            page.close()
            browser.close()
    finally:
        server.terminate()
    print('\n' + ('ALL PASSED' if not fails else f'{len(fails)} FAILED'))
    sys.exit(1 if fails else 0)


if __name__ == '__main__':
    main()
