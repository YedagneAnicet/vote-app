require("dotenv").config();
const express = require("express");
const session = require("express-session");
const path = require("path");

const { initSchema } = require("./db/database");
const voteRoutes = require("./routes/vote");
const adminRoutes = require("./routes/admin");

const app = express();

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

app.use(
  session({
    secret: process.env.SESSION_SECRET || "changez-cette-cle-en-production",
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, maxAge: 1000 * 60 * 30 },
  })
);

app.use("/admin", adminRoutes);
app.use("/", voteRoutes);

const PORT = process.env.PORT || 3000;

(async () => {
  await initSchema();
  app.listen(PORT, () => {
    console.log(`Plateforme de vote démarrée sur le port ${PORT}`);
  });
})();
