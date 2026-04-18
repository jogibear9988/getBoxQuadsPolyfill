import { test, expect, chromium, firefox } from '@playwright/test';

test('i9 matrix walk debug', async () => {
    const browser = await chromium.launch();
    const context = await browser.newContext({ viewport: { width: 900, height: 400 } });
    const page = await context.newPage();
    await page.goto('file:///Users/jkuehner/Documents/Repos/getBoxQuadsPolyfill/i9.html');
    await page.waitForTimeout(500);

    const result = await page.evaluate(() => {
        // Find the two AAAA divs (slotted lime elements)
        const allDivs = document.querySelectorAll('div');
        const aaaaDivs = [];
        for (const d of allDivs) {
            if (d.textContent.trim() === 'AAAA' && d.style.background === 'lime') {
                aaaaDivs.push(d);
            }
        }
        // Also check shadow DOMs
        const wcs = document.querySelectorAll('wc-test, wc-test2');
        for (const wc of wcs) {
            if (wc.shadowRoot) {
                for (const d of wc.shadowRoot.querySelectorAll('div')) {
                    // not searching here, the AAAA divs are in light DOM
                }
            }
        }

        const results = [];
        for (const el of aaaaDivs) {
            const host = el.assignedSlot?.getRootNode()?.host;
            const info = {
                text: el.textContent.trim(),
                hostTag: host?.tagName,
                offsetLeft: el.offsetLeft,
                offsetTop: el.offsetTop,
                offsetParentTag: el.offsetParent?.tagName,
                bcr: el.getBoundingClientRect(),
            };

            // Get the quad from polyfill
            const quads = el.getBoxQuads({ relativeTo: document.body });
            info.quad_p1 = { x: quads[0].p1.x, y: quads[0].p1.y };
            info.quad_p2 = { x: quads[0].p2.x, y: quads[0].p2.y };

            // Walk the parent chain manually to understand offsets
            info.parentChain = [];
            let cur = el;
            while (cur && cur !== document.body) {
                const entry = {
                    tag: cur.tagName || '#text',
                    isSlotted: cur.assignedSlot != null,
                };
                if (cur instanceof HTMLElement) {
                    const st = getComputedStyle(cur);
                    entry.position = st.position;
                    entry.offsetLeft = cur.offsetLeft;
                    entry.offsetTop = cur.offsetTop;
                    entry.offsetParentTag = cur.offsetParent?.tagName;
                    entry.left = st.left;
                    entry.top = st.top;
                    entry.marginLeft = st.marginLeft;
                    entry.marginTop = st.marginTop;
                    entry.rotate = st.rotate;
                    entry.transform = st.transform;
                    if (cur instanceof HTMLSlotElement) entry.isSlot = true;
                }
                info.parentChain.push(entry);

                // Walk: if slotted, go to assignedSlot
                if (cur.assignedSlot) {
                    cur = cur.assignedSlot;
                } else {
                    cur = cur.parentElement;
                }
            }

            results.push(info);
        }
        return results;
    });

    for (const r of result) {
        console.log(`\n=== ${r.hostTag} AAAA ===`);
        console.log(`  offsetLeft=${r.offsetLeft} offsetTop=${r.offsetTop} offsetParent=${r.offsetParentTag}`);
        console.log(`  BCR: (${r.bcr.x.toFixed(1)}, ${r.bcr.y.toFixed(1)}, ${r.bcr.width.toFixed(1)}, ${r.bcr.height.toFixed(1)})`);
        console.log(`  quad p1=(${r.quad_p1.x.toFixed(1)}, ${r.quad_p1.y.toFixed(1)}) p2=(${r.quad_p2.x.toFixed(1)}, ${r.quad_p2.y.toFixed(1)})`);
        console.log('  Parent chain:');
        for (const p of r.parentChain) {
            let line = `    ${p.tag}`;
            if (p.isSlotted) line += ' [SLOTTED]';
            if (p.isSlot) line += ' [SLOT]';
            if (p.position) line += ` pos=${p.position}`;
            if (p.offsetLeft !== undefined) line += ` off(${p.offsetLeft},${p.offsetTop})→${p.offsetParentTag}`;
            if (p.left && p.left !== 'auto' && p.left !== '0px') line += ` left=${p.left}`;
            if (p.top && p.top !== 'auto' && p.top !== '0px') line += ` top=${p.top}`;
            if (p.marginLeft && p.marginLeft !== '0px') line += ` ml=${p.marginLeft}`;
            if (p.marginTop && p.marginTop !== '0px') line += ` mt=${p.marginTop}`;
            if (p.rotate && p.rotate !== 'none') line += ` rotate=${p.rotate}`;
            if (p.transform && p.transform !== 'none') line += ` transform=${p.transform}`;
            console.log(line);
        }
    }

    await browser.close();
});
