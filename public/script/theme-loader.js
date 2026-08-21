const socketTheme = new WebSocket(`ws://${window.location.host}`);

async function loadTheme() {
    try {
        const res = await fetch('/api/theme');
        const theme = await res.json();
        applyTheme(theme);
    } catch (e) { console.error("Theme Error", e); }
}

function hexOp(hex, opacity) {
    if (!hex) return '#000000ff';
    const opVal = (opacity === undefined || opacity === null) ? 100 : opacity;
    let alpha = Math.round((opVal / 100) * 255).toString(16);
    if (alpha.length === 1) alpha = "0" + alpha;
    return hex + alpha;
}

function getImgUrl(filename) {
    if(!filename) return 'none';
    return `url('Assets/costum/Theme/${filename}')`;
}

// Helper untuk Gradient
function getBgLogic(g, key, primaryColor, o, opacityKey) {
    // Safety check jika g (gradients) undefined
    if (!g) g = {}; 
    const grad = g[key] || { enabled: false, colorB: '#000000', angle: 90 };
    const opVal = opacityKey ? (o[opacityKey] || 100) : 100;
    const colA = hexOp(primaryColor, opVal);

    if (grad.enabled) {
        const colB = hexOp(grad.colorB, opVal);
        return `linear-gradient(${grad.angle}deg, ${colA}, ${colB})`;
    } else {
        return colA;
    }
}

function applyTheme(theme) {
    const root = document.documentElement;
    const c = theme.colors || {};
    const t = theme.toggles || {};
    const o = theme.opacity || {};
    const sb = theme.scoreboard || {};
    const g = theme.gradients || {};
    const a = theme.animations || {};

    // --- 1. LOGIC BACKGROUND GRADIENTS (Termasuk Post Draft) ---
    root.style.setProperty('--upper-bg', getBgLogic(g, 'upperBg', c.upperBg, o, 'upper'));
    root.style.setProperty('--lower-bg', getBgLogic(g, 'lowerBg', c.lowerBg, o, 'lower'));
    root.style.setProperty('--lowermid-bg', getBgLogic(g, 'lowerMidBg', c.lowerMidBg, o, null));
    root.style.setProperty('--heropick-bg', getBgLogic(g, 'heroPickBg', c.heroPickBg, o, 'heroPick'));
    root.style.setProperty('--logoteam-bg', getBgLogic(g, 'logoTeamBg', c.logoTeamBg, o, 'logoTeam'));
    
    // NEW: Post Draft Background dengan Gradient Support
    const pdBg = getBgLogic(g, 'postDraftBg', c.postDraftBg, o, null);
    root.style.setProperty('--postdraft-bg', t.hidePostDraftBg ? 'transparent' : pdBg);

    // --- 2. PATTERN COLOR ---
    // Mengatur warna pola garis (Grid)
    root.style.setProperty('--pattern-color', c.patternColor || 'rgba(255,255,255,0.03)');
    root.style.setProperty('--pattern-display', t.hidePattern ? 'none' : 'block');

    // --- 3. SCOREBOARD GRADIENTS ---
    root.style.setProperty('--sb-bg-teamname', getBgLogic(g, 'sbBgTeamName', sb.bgTeamName, o, null));
    root.style.setProperty('--sb-bg-logo', getBgLogic(g, 'sbBgLogo', sb.bgLogo, o, null));
    root.style.setProperty('--sb-bg-score', getBgLogic(g, 'sbBgScore', sb.bgScore, o, null));
    root.style.setProperty('--sb-bg-combined', getBgLogic(g, 'sbBgCombined', sb.bgCombined, o, null));
    root.style.setProperty('--sb-bg-box1', getBgLogic(g, 'sbBgBox1', sb.bgBox1, o, null));
    root.style.setProperty('--sb-bg-secondary', getBgLogic(g, 'sbBgSecondary', sb.bgSecondary, o, null));

    // --- 4. STANDARD COLORS ---
    root.style.setProperty('--blue-primary', c.bluePrimary);
    root.style.setProperty('--red-primary', c.redPrimary);
    root.style.setProperty('--blue-dark', c.blueDark);
    root.style.setProperty('--red-dark', c.redDark);
    root.style.setProperty('--score-blue', c.scoreBlue || c.bluePrimary);
    root.style.setProperty('--score-red', c.scoreRed || c.redPrimary);
    
    root.style.setProperty('--aura-ban-color', c.auraBan || '#ff0000');
    root.style.setProperty('--aura-pick-color', c.auraPick || '#ffffff');
    root.style.setProperty('--timer-blue', c.timerBlue);
    root.style.setProperty('--timer-mid', c.timerMid);
    root.style.setProperty('--timer-red', c.timerRed);
    
    root.style.setProperty('--player-text-color', c.playerName);
    root.style.setProperty('--player-bg', getBgLogic(g, 'playerNameBg', c.playerNameBg, o, null));

    root.style.setProperty('--lane-bg', c.laneLogoBg);
    root.style.setProperty('--lane-border-color', c.laneLogoBorder);
    root.style.setProperty('--global-border', c.globalBorder || 'rgba(255,255,255,0.2)');

    // --- 5. IMAGES ---
    root.style.setProperty('--heropick-img', getImgUrl(theme.images.heroPickBg));
    root.style.setProperty('--lower-img', getImgUrl(theme.images.lowerBg));
    root.style.setProperty('--lowermid-img', getImgUrl(theme.images.lowerMidBg));
    const flagUrl = sb.activeFlag ? `url('Assets/nationalflag/${sb.activeFlag}')` : 'none';
    root.style.setProperty('--sb-flag-img', flagUrl);

    // --- 6. SCOREBOARD TEXT & TOGGLES ---
    root.style.setProperty('--sb-teamname-blue', sb.teamNameBlue);
    root.style.setProperty('--sb-teamname-red', sb.teamNameRed);
    root.style.setProperty('--sb-border-bottom', sb.borderBottom);

    // Glow Logic
    if (t.disableGlow) {
        root.style.setProperty('--text-glow-blue', 'none'); root.style.setProperty('--text-glow-red', 'none');
        root.style.setProperty('--box-glow-blue', 'none'); root.style.setProperty('--box-glow-red', 'none');
        root.style.setProperty('--score-shadow', 'none');
    } else {
        root.style.setProperty('--text-glow-blue', `0 0 10px ${c.bluePrimary}`);
        root.style.setProperty('--text-glow-red', `0 0 10px ${c.redPrimary}`);
        root.style.setProperty('--box-glow-blue', `0 0 15px ${c.bluePrimary}`);
        root.style.setProperty('--box-glow-red', `0 0 15px ${c.redPrimary}`);
        root.style.setProperty('--score-shadow', `0 0 15px`);
    }

    if (sb.disableGlow) {
        root.style.setProperty('--sb-glow-blue', 'none'); root.style.setProperty('--sb-glow-red', 'none');
    } else {
        root.style.setProperty('--sb-glow-blue', `0 0 10px ${sb.teamNameBlue}`);
        root.style.setProperty('--sb-glow-red', `0 0 10px ${sb.teamNameRed}`);
    }

    root.style.setProperty('--main-box-shadow', t.disableBoxShadow ? 'none' : 'inset 0 0 20px rgba(0,0,0,0.8)');
    if(sb.disableShadow) {
        root.style.setProperty('--sb-box-shadow-blue', 'none'); root.style.setProperty('--sb-box-shadow-red', 'none');
    } else {
        root.style.setProperty('--sb-box-shadow-blue', `0 0 10px rgba(0, 210, 255, 0.2)`);
        root.style.setProperty('--sb-box-shadow-red', `0 0 10px rgba(255, 42, 42, 0.2)`);
    }

    // --- 7. ANIMATIONS & FONTS ---
    const animMap = { 'pulse': 'pulse', 'flash': 'flash', 'static': 'none' };
    const banAnim = animMap[a.banType] || 'pulse';
    const pickAnim = animMap[a.banType] || 'pulse';
    root.style.setProperty('--anim-ban-name', banAnim === 'none' ? 'none' : (banAnim + 'Ban'));
    root.style.setProperty('--anim-pick-name', pickAnim === 'none' ? 'none' : (pickAnim + 'Pick'));

    let heroCss = '';
    const hType = a.heroAnim;
    if (hType === 'slide') heroCss = `.image-box img { opacity: 0; transform: translateY(100%); transition: transform 1.2s cubic-bezier(0.2, 0.8, 0.2, 1), opacity 1.2s ease; } .image-box.show img { opacity: 1; transform: translateY(0); }`;
    else if (hType === 'reveal') heroCss = `.image-box img { opacity: 1; clip-path: inset(100% 0 0 0); transform: scale(1); transition: clip-path 1.5s cubic-bezier(0.19, 1, 0.22, 1); } .image-box.show img { clip-path: inset(0 0 0 0); }`;
    else if (hType === 'creative') heroCss = `.image-box img { opacity: 0; transform: scale(2) rotate(5deg); filter: blur(20px) brightness(2); transition: all 0.8s cubic-bezier(0.1, 0.9, 0.2, 1); } .image-box.show img { opacity: 1; transform: scale(1) rotate(0deg); filter: blur(0) brightness(1); }`;
    else heroCss = `.image-box img { opacity: 0; transform: scale(1.15); transition: opacity 1.2s ease-out, transform 1.2s cubic-bezier(0.25, 1, 0.5, 1); } .image-box.show img { opacity: 1; transform: scale(1); }`;
    
    let styleTag = document.getElementById('hero-anim-style');
    if (!styleTag) { styleTag = document.createElement('style'); styleTag.id = 'hero-anim-style'; document.head.appendChild(styleTag); }
    styleTag.innerHTML = heroCss;

    let fontStyle = document.getElementById('dyn-font');
    if(theme.useCustomFont && theme.fontFile) {
        if(!fontStyle) { fontStyle = document.createElement('style'); fontStyle.id='dyn-font'; document.head.appendChild(fontStyle); }
        const fontPath = `Assets/costum/Theme/${theme.fontFile}`;
        fontStyle.innerHTML = `@font-face { font-family: 'myfonts'; src: url('${fontPath}') format('truetype'); } body { font-family: 'myfonts', sans-serif !important; }`;
    } else { if(fontStyle) fontStyle.remove(); }
    root.style.setProperty('--font-scale', theme.fontSizeMultiplier || 1.0);

    const invertVal = c.laneIconType === 'white' ? 'invert(1)' : 'invert(0)';
    root.style.setProperty('--lane-filter', invertVal);
    const displayVal = t.hideLaneLogo ? 'none' : 'flex';
    root.style.setProperty('--lane-display', displayVal);
    document.querySelectorAll('.lanelogo').forEach(el => { el.style.display = displayVal; });
    document.querySelectorAll('.lanelogo img').forEach(img => { img.style.filter = invertVal; });
}

socketTheme.addEventListener('message', e => {
    const msg = JSON.parse(e.data);
    if (msg.type === 'theme_update') applyTheme(msg.data);
});
loadTheme();