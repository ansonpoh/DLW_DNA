export function getRoot(req, res) {
  return res.json({ message: "Backend server is running." });
}

export function getHealth(req, res) {
  return res.status(200).json({ status: "ok" });
}
