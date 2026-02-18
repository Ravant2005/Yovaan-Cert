import { Router } from "express";
import { fetchIPFSFile } from "../services/ipfs.js";

const router = Router();

router.get("/:cid", async (req, res) => {
  try {
    const { cid } = req.params;
    if (!cid) return res.status(400).json({ error: "CID is required" });

    const file = await fetchIPFSFile(cid);

    res.setHeader("Content-Type", file.contentType);
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.setHeader("X-IPFS-Source", file.sourceUrl);
    res.send(file.buffer);
  } catch (err) {
    res.status(502).json({
      error: "Unable to fetch file from IPFS gateways",
      details: err.message,
    });
  }
});

export default router;
