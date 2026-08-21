// server.js - PORT 3000 (Safe & Rare) & Strict IP Filter

const WebSocket = require("ws")
const http = require("http")
const express = require("express")
const fs = require("fs").promises // Untuk operasi file asinkron
const fsSync = require("fs") // Untuk pengecekan folder sinkron saat start
const path = require("path")
const os = require("os")
const multer = require("multer") // Wajib: npm install multer

const app = express()
const server = http.createServer(app)
const wss = new WebSocket.Server({ server })

// Limit besar untuk handle upload data base64 jika ada
app.use(express.json({ limit: "50mb" }))
app.use(express.urlencoded({ extended: true, limit: "50mb" }))
app.use(express.static("public"))

// ==========================================
// 1. PERSIAPAN FOLDER & FILE DATABASE
// ==========================================
const dbDir = path.join(__dirname, "public/database")
const savedMatchDir = path.join(dbDir, "savedmatch")
// Folder gabungan untuk Tema, Font, dan Background Custom
const unifiedDir = path.join(__dirname, "public/Assets/costum/Theme")
// Folder khusus National Flag
const flagDir = path.join(__dirname, "public/Assets/nationalflag")

// Buat folder jika belum ada
if (!fsSync.existsSync(dbDir)) fsSync.mkdirSync(dbDir, { recursive: true })
if (!fsSync.existsSync(savedMatchDir))
  fsSync.mkdirSync(savedMatchDir, { recursive: true })
if (!fsSync.existsSync(unifiedDir))
  fsSync.mkdirSync(unifiedDir, { recursive: true })
if (!fsSync.existsSync(flagDir)) fsSync.mkdirSync(flagDir, { recursive: true })

// --- FILE PATHS ---
const matchDataPath = path.join(dbDir, "matchdatateam.json")
const draftDataPath = path.join(dbDir, "matchdraft.json")
const prevDraftPath = path.join(dbDir, "previousmatchdraft.json")
const mapDrawPath = path.join(dbDir, "mapdraw.json")
const mvpDataPath = path.join(dbDir, "mvpdata.json")
const notifPath = path.join(dbDir, "notification.json")
const schedulePath = path.join(dbDir, "schedule.json")
const itemsPath = path.join(dbDir, "items.json")
const flagJsonPath = path.join(dbDir, "flags.json")
const timerPath = path.join(dbDir, "timer.json")
const tickerPath = path.join(dbDir, "ticker.json")
const themePath = path.join(unifiedDir, "theme.json")

// --- KONFIGURASI UPLOAD ---

// 1. Storage untuk Theme Assets (Font, BG)
const storageUnified = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, unifiedDir)
  },
  filename: (req, file, cb) => {
    cb(null, file.originalname)
  },
})
const uploadUnified = multer({ storage: storageUnified })

// 2. Storage untuk Flag
const storageFlag = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, flagDir)
  },
  filename: (req, file, cb) => {
    cb(null, file.originalname)
  },
})
const uploadFlag = multer({ storage: storageFlag })

// ==========================================
// 2. DEFAULT DATA GENERATORS
// ==========================================

const defaultMatchData = {
  game_duration: "00:00",
  game_number: 0,
  winmatches: "none",
  teamdata: {
    blueteam: {
      teamname: "BLUE TEAM",
      score: "0",
      logo: "",
      totalgold: 0,
      turret: 0,
      lord: 0,
      turtle: 0,
      playerlist: Array(5)
        .fill()
        .map(() => ({
          name: "Player",
          hero: "",
          level: 0,
          KDA: "0/0/0",
          gold: 0,
          spell: "idle",
          itemlist: ["idle", "idle", "idle", "idle", "idle", "idle"],
        })),
    },
    redteam: {
      teamname: "RED TEAM",
      score: "0",
      logo: "",
      totalgold: 0,
      turret: 0,
      lord: 0,
      turtle: 0,
      playerlist: Array(5)
        .fill()
        .map(() => ({
          name: "Player",
          hero: "",
          level: 0,
          KDA: "0/0/0",
          gold: 0,
          spell: "idle",
          itemlist: ["idle", "idle", "idle", "idle", "idle", "idle"],
        })),
    },
  },
}

// Default Theme Config V3.5 (Updated with Gradient Support)
const defaultTheme = {
  fontFile: "Renegade Pursuit.otf",
  useCustomFont: false,
  fontSizeMultiplier: 1.0,

  images: {
    heroPickBg: "",
    lowerBg: "",
    lowerMidBg: "",
  },

  colors: {
    bluePrimary: "#00d2ff",
    blueDark: "#003e4d",
    redPrimary: "#ff2a2a",
    redDark: "#4d0000",
    scoreBlue: "#00d2ff",
    scoreRed: "#ff2a2a",

    upperBg: "#000000",
    lowerBg: "#0a0a0a",
    lowerMidBg: "#111111",
    heroPickBg: "#1e1e1e",
    logoTeamBg: "#000000",
    postDraftBg: "#1a1a1a",
    playerNameBg: "#000000",
    laneLogoBg: "rgba(0,0,0,0.8)",

    timerBlue: "#00d2ff",
    timerMid: "#ffffff",
    timerRed: "#ff2a2a",
    playerName: "#ffffff",
    phaseText: "#ffffff",

    laneIconType: "white",
    laneLogoBorder: "#ffffff",
    auraBan: "#ff0000",
    auraPick: "#ffffff",

    globalBorder: "rgba(255, 255, 255, 0.2)",
  },

  // NEW V3.5: Gradient Configurations
  // Menyimpan setting (enabled, colorB, angle) untuk setiap background
  gradients: {
    // Global Backgrounds
    upperBg: { enabled: false, colorB: "#333333", angle: 90 },
    lowerBg: { enabled: false, colorB: "#333333", angle: 90 },
    lowerMidBg: { enabled: false, colorB: "#333333", angle: 90 },
    heroPickBg: { enabled: false, colorB: "#333333", angle: 90 },
    logoTeamBg: { enabled: false, colorB: "#333333", angle: 90 },

    // Scoreboard Backgrounds
    sbBgTeamName: { enabled: false, colorB: "#333333", angle: 90 },
    sbBgLogo: { enabled: false, colorB: "#333333", angle: 90 },
    sbBgScore: { enabled: false, colorB: "#333333", angle: 90 },
    sbBgCombined: { enabled: false, colorB: "#333333", angle: 90 },
    sbBgBox1: { enabled: false, colorB: "#333333", angle: 90 },
    sbBgSecondary: { enabled: false, colorB: "#333333", angle: 90 },
  },

  // Scoreboard Specific (V3.4)
  scoreboard: {
    teamNameBlue: "#00d2ff",
    teamNameRed: "#ff2a2a",
    bgTeamName: "#1e1e1e",
    bgLogo: "#000000",
    bgScore: "#000000",
    bgCombined: "#0a0a0a",
    bgBox1: "#1e1e1e",
    bgSecondary: "#1e1e1e",
    borderBottom: "rgba(255, 255, 255, 0.2)",
    activeFlag: "indonesia.png",
    disableGlow: false,
    disableShadow: false,
  },

  opacity: {
    upper: 100,
    lower: 100,
    heroPick: 100,
    logoTeam: 60,
    postDraft: 100,
  },

  toggles: {
    hideLaneLogo: false,
    disableGlow: false,
    hidePattern: false,
    hidePostDraftBg: false,
    disableBoxShadow: false,
  },

  animations: {
    banType: "pulse",
    pickType: "pulse",
    heroAnim: "fade",
  },
}

const defaultDraftData = {
  draftdata: {
    timer: "60",
    timer_running: false,
    current_phase: 0,
    blueside: { ban: [{}, {}, {}, {}, {}], pick: [{}, {}, {}, {}, {}] },
    redside: { ban: [{}, {}, {}, {}, {}], pick: [{}, {}, {}, {}, {}] },
  },
}

// Inisialisasi File
if (!fsSync.existsSync(matchDataPath))
  fsSync.writeFileSync(matchDataPath, JSON.stringify(defaultMatchData, null, 2))
if (!fsSync.existsSync(draftDataPath))
  fsSync.writeFileSync(draftDataPath, JSON.stringify(defaultDraftData, null, 2))
if (!fsSync.existsSync(prevDraftPath))
  fsSync.writeFileSync(prevDraftPath, JSON.stringify(defaultDraftData, null, 2))
if (!fsSync.existsSync(themePath))
  fsSync.writeFileSync(themePath, JSON.stringify(defaultTheme, null, 2))
if (!fsSync.existsSync(mapDrawPath))
  fsSync.writeFileSync(
    mapDrawPath,
    JSON.stringify({ drawdata: { status: "idle" } }, null, 2),
  )
if (!fsSync.existsSync(mvpDataPath))
  fsSync.writeFileSync(mvpDataPath, JSON.stringify({ mvp: null }, null, 2))
if (!fsSync.existsSync(schedulePath))
  fsSync.writeFileSync(schedulePath, JSON.stringify({}, null, 2))
if (!fsSync.existsSync(notifPath))
  fsSync.writeFileSync(notifPath, JSON.stringify({}, null, 2))

if (!fsSync.existsSync(timerPath)) {
  const defaultTimer = {
    isRunning: false,
    endTime: 0,
    remaining: 300000, // 5 minutes in ms
    label: "NEXT MATCH STARTS IN",
  }
  fsSync.writeFileSync(timerPath, JSON.stringify(defaultTimer, null, 2))
}

if (!fsSync.existsSync(tickerPath)) {
  const defaultTicker = {
    text: "WELCOME TO THE TOURNAMENT - STAY TUNED FOR MORE MATCHES",
    speed: 10, // seconds for one loop (or abstract speed value)
    isRunning: true,
  }
  fsSync.writeFileSync(tickerPath, JSON.stringify(defaultTicker, null, 2))
}

if (!fsSync.existsSync(itemsPath)) {
  const defaultItems = [
    "winter_truncheon",
    "immortality",
    "athena_shield",
    "blade_armor",
    "antique_cuirass",
    "oracle",
    "radiant_armor",
    "twilight_armor",
    "guardian_helmet",
    "sky_guardian_helmet",
    "thunder_belt",
    "cursed_helmet",
  ]
  fsSync.writeFileSync(itemsPath, JSON.stringify(defaultItems, null, 2))
}

// Inisialisasi Database Flag (Auto Scan)
async function initFlagDB() {
  if (!fsSync.existsSync(flagJsonPath)) {
    try {
      const files = await fs.readdir(flagDir)
      const imageFiles = files.filter((file) =>
        /\.(png|jpg|jpeg|webp)$/i.test(file),
      )
      await fs.writeFile(flagJsonPath, JSON.stringify(imageFiles, null, 2))
    } catch (error) {
      await fs.writeFile(flagJsonPath, JSON.stringify([], null, 2))
    }
  }
}
initFlagDB()

// ==========================================
// 3. FUNGSI HELPER (IP FILTERING)
// ==========================================

function getLocalIp() {
  const nets = os.networkInterfaces()
  let candidateIp = "localhost"
  const virtualKeywords = [
    "virtual",
    "vmware",
    "vbox",
    "virtualbox",
    "wsl",
    "hyper-v",
    "vethernet",
    "docker",
    "vpn",
    "zerotier",
    "tap",
    "tun",
  ]

  for (const name of Object.keys(nets)) {
    const isVirtual = virtualKeywords.some((keyword) =>
      name.toLowerCase().includes(keyword),
    )
    if (!isVirtual) {
      for (const net of nets[name]) {
        if (net.family === "IPv4" && !net.internal) {
          if (
            name.toLowerCase().includes("wi-fi") ||
            name.toLowerCase().includes("ethernet") ||
            name.toLowerCase().includes("en0") ||
            name.toLowerCase().includes("eth0")
          ) {
            return net.address
          }
          candidateIp = net.address
        }
      }
    }
  }
  return candidateIp
}

function broadcast(data) {
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(data))
    }
  })
}

// ==========================================
// 4. API ROUTES
// ==========================================

// --- MATCH DATA API ---
app.get("/api/matchdata", async (req, res) => {
  try {
    const data = await fs.readFile(matchDataPath, "utf8")
    res.json(JSON.parse(data))
  } catch (error) {
    res.status(500).json({ message: "Error reading match data" })
  }
})

app.post("/api/matchdata", async (req, res) => {
  try {
    await fs.writeFile(matchDataPath, JSON.stringify(req.body, null, 2))
    broadcast({ type: "matchdata_update", data: req.body })
    broadcast({ type: "update", data: { matchdata: req.body } })
    res.json({ message: "Match data saved" })
  } catch (error) {
    res.status(500).json({ message: "Error saving match data" })
  }
})

// --- MATCH DRAFT API ---
app.get("/api/matchdraft", async (req, res) => {
  try {
    const data = await fs.readFile(draftDataPath, "utf8")
    res.json(JSON.parse(data))
  } catch (error) {
    res.status(500).json({ message: "Error reading draft" })
  }
})

app.post("/api/matchdraft", async (req, res) => {
  try {
    await fs.writeFile(draftDataPath, JSON.stringify(req.body, null, 2))
    broadcast({ type: "draftdata_update", data: req.body })
    res.json({ message: "Draft data saved" })
  } catch (error) {
    res.status(500).json({ message: "Error saving draft" })
  }
})

// --- THEME API (LOAD & SAVE CONFIG) ---
app.get("/api/theme", async (req, res) => {
  try {
    const data = await fs.readFile(themePath, "utf8")
    res.json(JSON.parse(data))
  } catch (error) {
    res.json(defaultTheme)
  }
})

app.post("/api/theme", async (req, res) => {
  try {
    await fs.writeFile(themePath, JSON.stringify(req.body, null, 2))
    broadcast({ type: "theme_update", data: req.body })
    res.json({ message: "Theme saved" })
  } catch (error) {
    res.status(500).json({ message: "Error saving theme" })
  }
})

app.post("/api/theme-reset", async (req, res) => {
  try {
    await fs.writeFile(themePath, JSON.stringify(defaultTheme, null, 2))
    broadcast({ type: "theme_update", data: defaultTheme })
    res.json({ message: "Theme Reset to Default", theme: defaultTheme })
  } catch (error) {
    res.status(500).json({ message: "Error resetting theme" })
  }
})

// --- FLAG API ---
app.get("/api/flags", async (req, res) => {
  try {
    const files = await fs.readdir(flagDir)
    const imageFiles = files.filter((file) =>
      /\.(png|jpg|jpeg|webp)$/i.test(file),
    )
    await fs.writeFile(flagJsonPath, JSON.stringify(imageFiles, null, 2))
    res.json(imageFiles)
  } catch (error) {
    res.json([])
  }
})

app.post("/api/upload-flag", uploadFlag.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ message: "No file uploaded" })
  try {
    const files = await fs.readdir(flagDir)
    const imageFiles = files.filter((file) =>
      /\.(png|jpg|jpeg|webp)$/i.test(file),
    )
    await fs.writeFile(flagJsonPath, JSON.stringify(imageFiles, null, 2))
    res.json({
      message: "Flag uploaded successfully",
      filename: req.file.originalname,
      list: imageFiles,
    })
  } catch (error) {
    res.status(500).json({ message: "Error uploading flag" })
  }
})

// --- UNIFIED UPLOAD API ---
app.post(
  "/api/upload-asset",
  uploadUnified.single("file"),
  async (req, res) => {
    if (!req.file) return res.status(400).json({ message: "No file uploaded" })

    const targetField = req.body.targetField
    const ext = path.extname(req.file.originalname).toLowerCase()

    try {
      const currentTheme = JSON.parse(await fs.readFile(themePath, "utf8"))
      if (!currentTheme.images) currentTheme.images = {}

      if (targetField === "font" && (ext === ".ttf" || ext === ".otf")) {
        currentTheme.fontFile = req.file.originalname
        currentTheme.useCustomFont = true
      } else if ([".png", ".jpg", ".jpeg"].includes(ext)) {
        if (targetField === "heroPickBg")
          currentTheme.images.heroPickBg = req.file.originalname
        else if (targetField === "lowerBg")
          currentTheme.images.lowerBg = req.file.originalname
        else if (targetField === "lowerMidBg")
          currentTheme.images.lowerMidBg = req.file.originalname
      }

      await fs.writeFile(themePath, JSON.stringify(currentTheme, null, 2))
      broadcast({ type: "theme_update", data: currentTheme })

      res.json({
        message: "Asset uploaded successfully",
        filename: req.file.originalname,
        updatedTheme: currentTheme,
      })
    } catch (error) {
      console.error("Upload Error:", error)
      res.status(500).json({ message: "Error updating theme config" })
    }
  },
)

// --- EXTRAS API ---
app.get("/api/items", async (req, res) => {
  try {
    const data = await fs.readFile(itemsPath, "utf8")
    res.json(JSON.parse(data))
  } catch (error) {
    res.json([])
  }
})

app.get("/api/schedule", async (req, res) => {
  try {
    const data = await fs.readFile(schedulePath, "utf8")
    res.json(JSON.parse(data))
  } catch (error) {
    res.json({})
  }
})
app.post("/api/schedule", async (req, res) => {
  try {
    await fs.writeFile(schedulePath, JSON.stringify(req.body, null, 2))
    broadcast({ type: "schedule_update", data: req.body })
    res.json({ message: "Schedule saved" })
  } catch (error) {
    res.status(500).json({ message: "Error" })
  }
})

app.get("/api/mapdraw", async (req, res) => {
  try {
    const data = await fs.readFile(mapDrawPath, "utf8")
    res.json(JSON.parse(data))
  } catch (error) {
    res.status(500).json({ message: "Error" })
  }
})
app.post("/api/mapdraw", async (req, res) => {
  try {
    await fs.writeFile(mapDrawPath, JSON.stringify(req.body, null, 2))
    broadcast({ type: "mapdraw_update", data: req.body.drawdata })
    res.json({ message: "Map saved" })
  } catch (error) {
    res.status(500).json({ message: "Error" })
  }
})

app.get("/api/mvp", async (req, res) => {
  try {
    const data = await fs.readFile(mvpDataPath, "utf8")
    res.json(JSON.parse(data))
  } catch (error) {
    res.status(500).json({ message: "Error" })
  }
})
app.post("/api/mvp", async (req, res) => {
  try {
    await fs.writeFile(mvpDataPath, JSON.stringify(req.body, null, 2))
    broadcast({ type: "mvp_update", data: req.body.mvp })
    res.json({ message: "MVP saved" })
  } catch (error) {
    res.status(500).json({ message: "Error" })
  }
})

app.post("/api/notification", async (req, res) => {
  try {
    const payload = { currentVideo: req.body.videoId, timestamp: Date.now() }
    await fs.writeFile(notifPath, JSON.stringify(payload, null, 2))
    broadcast({ type: "notification_trigger", videoId: req.body.videoId })
    res.json({ message: "Notification triggered" })
  } catch (error) {
    res.status(500).json({ message: "Error" })
  }
})

// --- TIMER API ---
app.get("/api/timer", async (req, res) => {
  try {
    const data = await fs.readFile(timerPath, "utf8")
    res.json(JSON.parse(data))
  } catch (error) {
    res.status(500).json({ message: "Error reading timer" })
  }
})

app.post("/api/timer", async (req, res) => {
  try {
    await fs.writeFile(timerPath, JSON.stringify(req.body, null, 2))
    broadcast({ type: "timer_update", data: req.body })
    res.json({ message: "Timer saved" })
  } catch (error) {
    res.status(500).json({ message: "Error saving timer" })
  }
})

// --- TICKER API ---
app.get("/api/ticker", async (req, res) => {
  try {
    const data = await fs.readFile(tickerPath, "utf8")
    res.json(JSON.parse(data))
  } catch (error) {
    res.status(500).json({ message: "Error reading ticker" })
  }
})

app.post("/api/ticker", async (req, res) => {
  try {
    await fs.writeFile(tickerPath, JSON.stringify(req.body, null, 2))
    broadcast({ type: "ticker_update", data: req.body })
    res.json({ message: "Ticker saved" })
  } catch (error) {
    res.status(500).json({ message: "Error saving ticker" })
  }
})

// --- FITUR ARSIP MATCH ---
app.post("/api/save-match-record", async (req, res) => {
  try {
    if (!fsSync.existsSync(savedMatchDir))
      await fs.mkdir(savedMatchDir, { recursive: true })
    for (let i = 6; i >= 1; i--) {
      const currentFile = path.join(savedMatchDir, `matchdata${i}.json`)
      const nextFile = path.join(savedMatchDir, `matchdata${i + 1}.json`)
      try {
        await fs.access(currentFile)
        await fs.rename(currentFile, nextFile)
      } catch (err) {}
    }
    const currentMatchData = await fs.readFile(matchDataPath, "utf8")
    const destPath = path.join(savedMatchDir, "matchdata1.json")
    await fs.writeFile(destPath, currentMatchData)
    res.json({ message: "Match archived successfully" })
  } catch (error) {
    res.status(500).json({ message: "Error archiving match data" })
  }
})

app.post("/api/archive-draft", async (req, res) => {
  try {
    const currentDraft = await fs.readFile(draftDataPath, "utf8")
    await fs.writeFile(prevDraftPath, currentDraft)
    broadcast({ type: "analyzer_update" })
    res.json({ message: "Draft archived" })
  } catch (error) {
    res.status(500).json({ message: "Error archiving draft" })
  }
})

app.get("/api/previousdraft", async (req, res) => {
  try {
    const data = await fs.readFile(prevDraftPath, "utf8")
    res.json(JSON.parse(data))
  } catch (error) {
    res.status(500).json({ message: "Error reading prev draft" })
  }
})

app.post("/api/analyzer-control", (req, res) => {
  broadcast({ type: "analyzer_control", action: req.body.action })
  res.json({ message: `Analyzer command sent` })
})

// ==========================================
// 5. WEBSOCKET SERVER
// ==========================================

wss.on("connection", (ws) => {
  ws.on("message", (message) => {
    try {
      const msg = JSON.parse(message)
      if (msg.type === "update") {
        wss.clients.forEach((client) => {
          if (client !== ws && client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(msg))
          }
        })
      }
    } catch (e) {
      console.error("WebSocket Message Error:", e)
    }
  })
})

// ==========================================
// 6. START SERVER (PORT 3000)
// ==========================================
const port = 3000
const localIp = getLocalIp()

server.listen(port, async () => {
  console.log("=============================================")
  console.log(` SERVER STARTED (False MLBB OVERLAY TOOL V4.1) `)
  console.log(` Local:   http://localhost:${port}`)
  console.log(` Network: http://${localIp}:${port}`)
  console.log("=============================================")

  try {
    await fs.writeFile(path.join(__dirname, "public/serverip.txt"), localIp)
  } catch (error) {}
})
