const path = require("path");
const fs = require("fs");
const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const morgan = require("morgan");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const Database = require("better-sqlite3");
require("dotenv").config();

const PORT = Number(process.env.PORT || 3000);
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "..", "data");
const JWT_SECRET = process.env.JWT_SECRET || "change-this-before-production";
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || "admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "ChangeMe-95200!";

fs.mkdirSync(DATA_DIR, { recursive: true });
const db = new Database(path.join(DATA_DIR, "workspace.db"));
db.pragma("journal_mode = WAL");

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user',
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_login_at TEXT
);
CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  action TEXT NOT NULL,
  details TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
`);

if (!db.prepare("SELECT id FROM users WHERE username=?").get(ADMIN_USERNAME)) {
  db.prepare("INSERT INTO users(username,password_hash,role) VALUES(?,?,'admin')")
    .run(ADMIN_USERNAME, bcrypt.hashSync(ADMIN_PASSWORD, 12));
}

const app = express();
app.use(helmet());
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(morgan("combined"));

function audit(userId, action, details="") {
  db.prepare("INSERT INTO audit_logs(user_id,action,details) VALUES(?,?,?)")
    .run(userId || null, action, details);
}
function auth(req,res,next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) return res.status(401).json({error:"Authentification requise."});
  try { req.user = jwt.verify(token, JWT_SECRET); next(); }
  catch { res.status(401).json({error:"Session invalide ou expirée."}); }
}
function admin(req,res,next) {
  if (req.user?.role !== "admin") return res.status(403).json({error:"Droits administrateur requis."});
  next();
}

app.get("/", (_req,res) => res.json({
  name:"JMH95200 Workspace Server",
  version:"6.0.0-alpha.1",
  status:"online"
}));

app.get("/api/health", (_req,res) => res.json({
  ok:true,
  version:"6.0.0-alpha.1",
  uptimeSeconds:Math.floor(process.uptime())
}));

app.post("/api/auth/login", (req,res) => {
  const username = String(req.body?.username || "").trim();
  const password = String(req.body?.password || "");
  const user = db.prepare("SELECT * FROM users WHERE username=?").get(username);
  if (!user || !user.active || !bcrypt.compareSync(password, user.password_hash)) {
    audit(user?.id, "login_failed", username);
    return res.status(401).json({error:"Identifiant ou mot de passe incorrect."});
  }
  db.prepare("UPDATE users SET last_login_at=CURRENT_TIMESTAMP WHERE id=?").run(user.id);
  audit(user.id, "login_success");
  const token = jwt.sign({id:user.id, username:user.username, role:user.role}, JWT_SECRET, {expiresIn:"12h"});
  res.json({token, user:{id:user.id, username:user.username, role:user.role}});
});

app.get("/api/me", auth, (req,res) => {
  const user = db.prepare("SELECT id,username,role,active,created_at,last_login_at FROM users WHERE id=?")
    .get(req.user.id);
  res.json(user);
});

app.get("/api/admin/users", auth, admin, (_req,res) => {
  res.json(db.prepare("SELECT id,username,role,active,created_at,last_login_at FROM users ORDER BY username").all());
});

app.post("/api/admin/users", auth, admin, (req,res) => {
  const username = String(req.body?.username || "").trim();
  const password = String(req.body?.password || "");
  const role = req.body?.role === "admin" ? "admin" : "user";
  if (!/^[a-zA-Z0-9._-]{3,50}$/.test(username)) return res.status(400).json({error:"Nom d'utilisateur invalide."});
  if (password.length < 8) return res.status(400).json({error:"Mot de passe trop court."});
  try {
    const result = db.prepare("INSERT INTO users(username,password_hash,role) VALUES(?,?,?)")
      .run(username, bcrypt.hashSync(password,12), role);
    audit(req.user.id, "user_created", username);
    res.status(201).json({id:result.lastInsertRowid, username, role});
  } catch {
    res.status(409).json({error:"Ce nom d'utilisateur existe déjà."});
  }
});

app.get("/api/admin/audit", auth, admin, (_req,res) => {
  res.json(db.prepare(`
    SELECT audit_logs.id, users.username, audit_logs.action,
           audit_logs.details, audit_logs.created_at
    FROM audit_logs
    LEFT JOIN users ON users.id=audit_logs.user_id
    ORDER BY audit_logs.id DESC LIMIT 500
  `).all());
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`JMH95200 Workspace Server V6 écoute sur le port ${PORT}`);
});
