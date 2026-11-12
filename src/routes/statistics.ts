import { Router } from "express";
import validator from "validator";
import { getStatistics } from "../db/statistics.js";
import { requireAuth } from "../middleware/requireAuth.js";

const router = Router();

router.get("/", requireAuth, async (req, res) => {
  const { from, to } = req.query;
  if (from !== undefined && (typeof from !== "string" ||
    !validator.isDate(from, { format: "YYYY-MM-DD", strictMode: true }))) {
    return res.status(400).json({ message: "from must be a valid YYYY-MM-DD date" });
  }
  if (typeof to !== "string" || !validator.isDate(to, { format: "YYYY-MM-DD", strictMode: true })) {
    return res.status(400).json({ message: "to must be a valid YYYY-MM-DD date" });
  }
  if (from !== undefined && from > to) {
    return res.status(400).json({ message: "from cannot be later than to" });
  }
  try {
    const statistics = await getStatistics(req.session.userId!, to, from);
    return res.json(statistics);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Failed to load training statistics" });
  }
});

export default router;
