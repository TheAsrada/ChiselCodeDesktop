import sharp from "sharp";
await sharp("assets/icon.svg").resize(512, 512).png().toFile("assets/icon.png");
