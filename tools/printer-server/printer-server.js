// printer-server.js
// ESC/POS 版本 POS 打印服务（Windows）
//
// - /ping 测试服务是否正常
// - /print-pos 接收 POS 打印请求，生成 ESC/POS 二进制数据
// - /print-summary 接收汇总打印请求
// - 通过 copy /B 把原始数据发到打印机共享

const express = require("express");
const bodyParser = require("body-parser");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { exec } = require("child_process");
const iconv = require("iconv-lite");
const Jimp = require("jimp");
const io = require('socket.io-client');
require('dotenv').config();
// === 打印机配置 ===
// 可以通过环境变量覆盖：POS_FRONT_PRINTER / POS_KITCHEN_PRINTER
// 注意：这里的名字建议用“打印机共享名”，例如 POS80、KITCHEN 等
const FRONT_PRINTER = process.env.POS_FRONT_PRINTER || "POS80";
const KITCHEN_PRINTER = process.env.POS_KITCHEN_PRINTER || "KC80";

// === ESC/POS 常量 ===
const ESC = 0x1b;
const GS = 0x1d;

// 打印宽度（逻辑宽度，用于对齐和画虚线，不影响纸张本身宽度）
const LINE_WIDTH = 32;
const LOGO_WIDTH_DOTS = Number(process.env.POS_LOGO_WIDTH_DOTS || 576);

// ========== 通用工具函数 ==========

// 打印时间：YYYYMMDD HH：MM：SS（注意这里用的是全角冒号：：）
function formatPrintTime(d = new Date()) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const HH = String(d.getHours()).padStart(2, "0");
  const MM = String(d.getMinutes()).padStart(2, "0");
  const SS = String(d.getSeconds()).padStart(2, "0");
  return `${yyyy}${mm}${dd} ${HH}：${MM}：${SS}`;
}

// 金额格式化（分 -> $x.xx）
function money(cents) {
  return `$${((cents || 0) / 100).toFixed(2)}`;
}

// 生成一整行分隔线
function makeLine(ch = "-") {
  return ch.repeat(LINE_WIDTH);
}

// 右侧补空格
function padRight(str, width) {
  const s = String(str ?? "");
  const len = s.length;
  if (len >= width) return s;
  return s + " ".repeat(width - len);
}

// 左侧补空格
function padLeft(str, width) {
  const s = String(str ?? "");
  const len = s.length;
  if (len >= width) return s;
  return " ".repeat(width - len) + s;
}

// 编码一行文本为 GBK，并自动加换行
function encLine(str = "") {
  return iconv.encode(String(str ?? "") + "\n", "gbk");
}

// 快速构造 ESC/POS 指令 Buffer
function cmd(...bytes) {
  return Buffer.from(bytes);
}

// PNG/JPG -> ESC/POS Raster Bit Image (GS v 0)
async function escposRasterFromImage(filePath, targetWidthDots = LOGO_WIDTH_DOTS) {
  const img = await Jimp.read(filePath);

  // 等比缩放到目标宽度
  img.resize(targetWidthDots, Jimp.AUTO);

  // 转灰度
  img.grayscale();

  const w = img.bitmap.width;
  const h = img.bitmap.height;

  // 每行字节数（8像素=1字节）
  const bytesPerRow = Math.ceil(w / 8);
  const data = Buffer.alloc(bytesPerRow * h);

  // 二值化阈值（越大越“黑”）
  const threshold = Number(process.env.POS_LOGO_THRESHOLD || 160);

  let offset = 0;
  for (let y = 0; y < h; y++) {
    for (let xByte = 0; xByte < bytesPerRow; xByte++) {
      let b = 0;
      for (let bit = 0; bit < 8; bit++) {
        const x = xByte * 8 + bit;
        let v = 255;
        if (x < w) {
          const rgba = Jimp.intToRGBA(img.getPixelColor(x, y));
          v = rgba.r; // grayscale 后 r=g=b
        }
        // 黑点=1（阈值以下当黑）
        if (v < threshold) b |= (0x80 >> bit);
      }
      data[offset++] = b;
    }
  }

  // GS v 0
  // xL xH = bytesPerRow（宽度按字节）
  // yL yH = h（高度按点）
  const xL = bytesPerRow & 0xff;
  const xH = (bytesPerRow >> 8) & 0xff;
  const yL = h & 0xff;
  const yH = (h >> 8) & 0xff;

  return Buffer.concat([
    cmd(GS, 0x76, 0x30, 0x00, xL, xH, yL, yH),
    data,
    encLine(""),
  ]);
}

// 将 ESC/POS 原始数据发送到指定打印机
function printEscPosTo(printerName, dataBuffer) {
  return new Promise((resolve, reject) => {
    const tmpFile = path.join(
      os.tmpdir(),
      `pos-escpos-${Date.now()}-${Math.random().toString(16).slice(2)}.bin`
    );

    fs.writeFile(tmpFile, dataBuffer, (err) => {
      if (err) {
        console.error("[printEscPosTo] 写入临时文件失败:", err);
        return reject(err);
      }

      // 如果传进来的 printerName 已经是完整 UNC，例如 \\PC\POS80，就直接用；
      // 否则默认拼成 \\localhost\共享名
      let devicePath = null;
      if (printerName) {
        if (printerName.startsWith("\\\\")) {
          devicePath = printerName;
        } else {
          devicePath = `\\\\localhost\\${printerName}`;
        }
      }

      // 使用 copy /B 直接把二进制发送到打印机共享
      let cmdStr;
      if (devicePath) {
        cmdStr = `cmd /C copy /B "${tmpFile}" "${devicePath}"`;
      } else {
        // 兜底：没有指定打印机名时尝试发到 PRN
        cmdStr = `cmd /C type "${tmpFile}" > PRN`;
      }

      console.log("[printEscPosTo] 执行命令:", cmdStr);

      exec(cmdStr, (error, stdout, stderr) => {
        // 打印完删除临时文件
        fs.unlink(tmpFile, () => {});

        if (error) {
          console.error("[printEscPosTo] copy /B 打印报错:", error);
          if (stderr) console.error("[printEscPosTo] stderr:", stderr);
          return reject(error);
        }

        if (stderr) {
          console.warn("[printEscPosTo] 打印命令 stderr:", stderr.toString().trim());
        }

        console.log("[printEscPosTo] 打印命令 stdout:", (stdout || "").toString().trim());
        resolve();
      });
    });
  });
}

// ========== ESC/POS 小票内容生成 ==========

// 顾客联
async function buildCustomerReceiptEscPos(params) {
  const { orderNumber, pickupCode, fulfillment, paymentMethod, snapshot } = params;

  const f = String(fulfillment || "").toLowerCase();
  const isDelivery = f === "delivery";

  const dineZh = isDelivery ? "配送" : f === "pickup" ? "外带" : "堂食";
  const dineEn = isDelivery ? "DELIVERY" : f === "pickup" ? "TAKE-OUT" : "DINE-IN";

  // --- payment method normalize ---
  const pm = String(paymentMethod || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]/g, "_"); // safety

  const normalizedPm = pm === "storebalance" ? "store_balance" : pm;

  const payZh =
    normalizedPm === "cash"
      ? "现金"
      : normalizedPm === "card"
      ? "银行卡"
      : normalizedPm === "wechat_alipay"
      ? "微信/支付宝"
      : normalizedPm === "store_balance" || normalizedPm === "balance"
      ? "储值余额"
      : "其他";

  const payEn =
    normalizedPm === "cash"
      ? "Cash"
      : normalizedPm === "card"
      ? "Card"
      : normalizedPm === "wechat_alipay"
      ? "WeChat / Alipay"
      : normalizedPm === "store_balance" || normalizedPm === "balance"
      ? "Store Balance"
      : "Other";

  const chunks = [];

  // 初始化打印机
  chunks.push(cmd(ESC, 0x40)); // ESC @

  // ✅ 行距调紧（减少整体留白）
  chunks.push(cmd(ESC, 0x33, 30));

  // ==== Logo（可选） ====
  try {
    const logoPath =
      process.env.POS_LOGO_PATH || path.join(__dirname, "assets", "logo.png");
    if (fs.existsSync(logoPath)) {
      chunks.push(cmd(ESC, 0x61, 0x01)); // 居中
      const logoBuf = await escposRasterFromImage(logoPath, LOGO_WIDTH_DOTS);
      chunks.push(logoBuf);
      chunks.push(cmd(ESC, 0x61, 0x00)); // 左对齐
      chunks.push(encLine("")); // 多给一行喘气
    } else {
      console.warn("[logo] 未找到 logo 文件，跳过:", logoPath);
    }
  } catch (e) {
    console.warn("[logo] 打印logo失败，跳过:", e?.message || e);
  }

  // ==== 取餐码（如果有的话） ====
  if (pickupCode) {
    // 居中 + 双倍宽高
    chunks.push(cmd(ESC, 0x61, 0x01)); // ESC a 1 -> 居中
    chunks.push(cmd(GS, 0x21, 0x11)); // GS ! 0x11 -> 双倍宽高
    chunks.push(encLine("取餐码"));
    chunks.push(encLine("PICKUP CODE"));
    chunks.push(encLine(String(pickupCode)));
    // 恢复正常大小
    chunks.push(cmd(GS, 0x21, 0x00)); // GS ! 0x00
    chunks.push(encLine(makeLine("*")));
    chunks.push(cmd(ESC, 0x61, 0x00)); // ESC a 0 -> 左对齐
  }

  // ==== 店名（中英文） ====
  chunks.push(cmd(ESC, 0x61, 0x01)); // 居中
  chunks.push(cmd(ESC, 0x45, 0x01)); // 加粗
  chunks.push(cmd(GS, 0x21, 0x01)); // 双倍高度（字体更显眼）
  chunks.push(encLine("三秦肉夹馍"));
  chunks.push(encLine("SanQ Rougiamo"));
  chunks.push(cmd(GS, 0x21, 0x00)); // 恢复正常大小
  chunks.push(cmd(ESC, 0x45, 0x00)); // 取消加粗
  chunks.push(cmd(ESC, 0x61, 0x00)); // 左对齐
  chunks.push(encLine(makeLine("-")));

  // ==== 订单信息 ====
  if (orderNumber) {
    chunks.push(encLine(`Order: ${orderNumber}`));
    chunks.push(encLine(""));
  }

  // 用餐方式
  chunks.push(encLine(`用餐方式: ${dineZh}`));
  chunks.push(encLine(`Dining:   ${dineEn}`));
  chunks.push(encLine(""));

  // 付款方式
  chunks.push(encLine(`付款方式: ${payZh}`));
  chunks.push(encLine(`Payment:  ${payEn}`));
  chunks.push(encLine(makeLine("-")));

  // ==== 菜品列表 ====
  if (Array.isArray(snapshot.items)) {
    snapshot.items.forEach((item) => {
      const nameZh = item.nameZh || "";
      const nameEn = item.nameEn || "";

      // 菜名：加粗 + 双倍高度
      chunks.push(cmd(ESC, 0x45, 0x01)); // bold on
      chunks.push(cmd(GS, 0x21, 0x01));  // double-height only

      if (nameZh) chunks.push(encLine(nameZh));
      if (nameEn) chunks.push(encLine(nameEn));

      // 恢复正常字号
      chunks.push(cmd(GS, 0x21, 0x00));
      chunks.push(cmd(ESC, 0x45, 0x00)); // bold off

      // 数量 + 行小计
      const qtyPart = `x${item.quantity}`;
      const pricePart = money(item.lineTotalCents ?? 0);

      const qtyPadded = padRight(qtyPart, 8);
      const pricePadded = padLeft(pricePart, LINE_WIDTH - 8);
      chunks.push(encLine(qtyPadded + pricePadded));

      // 选项
      const optionLines = (() => {
        if (Array.isArray(item.options)) {
          return item.options
            .map((x) => (typeof x === "string" ? x.trim() : ""))
            .filter(Boolean);
        }
        if (typeof item.optionsText === "string" && item.optionsText.trim()) {
          return item.optionsText
            .split("\n")
            .map((s) => s.trim())
            .filter(Boolean);
        }
        return [];
      })();

      if (optionLines.length > 0) {
        optionLines.forEach((opt) => {
          chunks.push(encLine(`  - ${opt}`));
        });
      }

      chunks.push(encLine(""));
    });
  }

  // ==== 金额汇总 ====
  const subtotal = snapshot.subtotalCents ?? 0;
  const discount = snapshot.discountCents ?? 0;
  const tax = snapshot.taxCents ?? 0;
  const total = snapshot.totalCents ?? 0;
  const loyalty = snapshot.loyalty || {};

  const deliveryFee = snapshot.deliveryFeeCents ?? 0;
  const deliveryCost =
    typeof snapshot.deliveryCostCents === "number" ? snapshot.deliveryCostCents : null;

  const deliverySubsidy =
    typeof snapshot.deliverySubsidyCents === "number"
      ? snapshot.deliverySubsidyCents
      : typeof deliveryCost === "number"
      ? Math.max(0, deliveryCost - deliveryFee)
      : null;

  chunks.push(encLine(makeLine("-")));
  chunks.push(encLine(`小计 Subtotal: ${money(subtotal)}`));
  if (discount > 0) {
    chunks.push(encLine(`折扣 Discount: -${money(discount)}`));
  }
  if (typeof loyalty.pointsRedeemed === "number" && loyalty.pointsRedeemed > 0) {
    chunks.push(encLine(`积分抵扣 Points: -${loyalty.pointsRedeemed.toFixed(2)} pt`));
  }

  if (isDelivery || deliveryFee > 0 || deliveryCost !== null) {
    chunks.push(encLine(`配送费(顾客) Delivery Fee: ${money(deliveryFee)}`));

    if (deliveryCost === null) {
      chunks.push(encLine(`平台运费成本 Delivery Cost: (pending)`));
      chunks.push(encLine(`本单补贴 Subsidy: (pending)`));
    } else {
      chunks.push(encLine(`平台运费成本 Delivery Cost: ${money(deliveryCost)}`));
      chunks.push(encLine(`本单补贴 Subsidy: ${money(deliverySubsidy ?? 0)}`));
    }
  }

  chunks.push(encLine(`税费(HST) Tax: ${money(tax)}`));
  chunks.push(encLine(`合计 Total:   ${money(total)}`));

  if (typeof loyalty.pointsEarned === "number" && loyalty.pointsEarned > 0) {
    chunks.push(encLine(`本单新增积分 Earned: +${loyalty.pointsEarned.toFixed(2)} pt`));
  }
  if (typeof loyalty.pointsBalanceAfter === "number") {
    chunks.push(encLine(`结算后积分 Balance: ${loyalty.pointsBalanceAfter.toFixed(2)} pt`));
  }
  chunks.push(encLine(makeLine("-")));

  // ==== 底部 ====
  chunks.push(cmd(ESC, 0x61, 0x01)); // 居中
  chunks.push(encLine("谢谢惠顾"));
  chunks.push(encLine("Thank you!"));
  chunks.push(encLine("顾客联 CUSTOMER COPY"));
  chunks.push(encLine(`打印时间 Print: ${formatPrintTime()}`));
  chunks.push(encLine(""));
  chunks.push(cmd(ESC, 0x61, 0x00)); // 左对齐

  // ==== 切纸 ====
  chunks.push(cmd(GS, 0x56, 0x42, 0x00)); // 部分切纸

  return Buffer.concat(chunks);
}

// 后厨联
function buildKitchenReceiptEscPos(params) {
  const { fulfillment, snapshot } = params;

  const dineZh = fulfillment === "pickup" ? "外带" : "堂食";
  const dineEn = fulfillment === "pickup" ? "TAKE-OUT" : "DINE-IN";

  const chunks = [];

  // 初始化打印机
  chunks.push(cmd(ESC, 0x40)); // ESC @
  chunks.push(cmd(ESC, 0x33, 30));

  // ==== 顶部：用餐方式（大号加粗） ====
  chunks.push(cmd(ESC, 0x61, 0x01)); // 居中
  chunks.push(cmd(ESC, 0x45, 0x01)); // 加粗
  chunks.push(cmd(GS, 0x21, 0x11)); // 双倍宽高
  chunks.push(encLine(dineZh));
  chunks.push(encLine(dineEn));
  chunks.push(cmd(GS, 0x21, 0x00)); // 恢复正常大小
  chunks.push(cmd(ESC, 0x45, 0x00)); // 取消加粗
  chunks.push(encLine(""));
  chunks.push(cmd(ESC, 0x61, 0x00)); // 左对齐
  chunks.push(encLine(makeLine("=")));

  // ==== 菜品（放大 + 加粗） ====
  if (Array.isArray(snapshot.items)) {
    snapshot.items.forEach((item) => {
      const nameZh = item.nameZh || "";
      const nameEn = item.nameEn || "";
      const qty = item.quantity ?? 0;

      chunks.push(cmd(ESC, 0x45, 0x01)); // 加粗
      chunks.push(cmd(GS, 0x21, 0x11)); // 双倍高度

      if (nameZh) chunks.push(encLine(`${qty}  ${nameZh}`));
      if (nameEn) chunks.push(encLine(`${qty}  ${nameEn}`));

      chunks.push(cmd(GS, 0x21, 0x00));
      chunks.push(cmd(ESC, 0x45, 0x00));
      chunks.push(encLine(""));
    });
  }

  // ==== 底部 ====
  chunks.push(encLine(makeLine("-")));
  chunks.push(cmd(ESC, 0x61, 0x01)); // 居中
  chunks.push(encLine("后厨联 KITCHEN COPY"));
  chunks.push(encLine(`打印时间 Print: ${formatPrintTime()}`));
  chunks.push(encLine(""));
  chunks.push(cmd(ESC, 0x61, 0x00)); // 左对齐

  chunks.push(cmd(GS, 0x56, 0x42, 0x00));
  return Buffer.concat(chunks);
}

// ✅ 构建汇总小票函数
function buildSummaryReceiptEscPos(params) {
  const { date, totals, breakdownType, breakdownItems } = params;
  const chunks = [];

  chunks.push(cmd(ESC, 0x40)); // Init
  chunks.push(cmd(ESC, 0x33, 20)); // 行间距
  chunks.push(cmd(ESC, 0x61, 0x01)); // Center
  chunks.push(cmd(ESC, 0x45, 0x01)); // Bold
  chunks.push(cmd(GS, 0x21, 0x11)); // Double Height & Width
  chunks.push(encLine("当日小结"));
  chunks.push(cmd(GS, 0x21, 0x00)); // Reset size
  chunks.push(cmd(ESC, 0x45, 0x00)); // Reset bold
  chunks.push(encLine("Daily Summary"));
  chunks.push(cmd(ESC, 0x61, 0x00)); // Left align
  chunks.push(encLine(makeLine("-")));

  if (date) {
    chunks.push(encLine(`日期: ${date}`));
  }
  chunks.push(encLine(makeLine("-")));

  if (Array.isArray(breakdownItems)) {
    chunks.push(cmd(ESC, 0x45, 0x01)); // Bold
    chunks.push(
      encLine(breakdownType === "payment" ? "按支付方式汇总 (By Payment)" : "按渠道汇总 (By Channel)")
    );
    chunks.push(cmd(ESC, 0x45, 0x00));
    chunks.push(encLine("(金额: 实际收款 - 不含税)"));
    chunks.push(encLine(""));

    chunks.push(encLine(padRight("类别", 14) + padLeft("单数", 6) + padLeft("金额", 12)));
    chunks.push(encLine(makeLine(".")));

    breakdownItems.forEach((item) => {
      const label = item.label || item.payment || item.fulfillmentType || "Unknown";
      chunks.push(encLine(label));

      const countStr = String(item.count);
      const amtStr = money(item.amountCents);
      const line = padLeft(countStr, 20) + padLeft(amtStr, 12);
      chunks.push(encLine(line));
    });
    chunks.push(encLine(makeLine("=")));
  }

  if (totals) {
    chunks.push(cmd(ESC, 0x45, 0x01)); // Bold
    chunks.push(encLine("今日总计 (Totals)"));
    chunks.push(cmd(ESC, 0x45, 0x00));

    const printRow = (label, valCents) => {
      const l = padRight(label, 20);
      const v = padLeft(money(valCents), LINE_WIDTH - 20);
      chunks.push(encLine(l + v));
    };

    // 注意：orders 不是 cents，但你原逻辑就是这么打印的（保持不改）
    printRow("总单量 Orders", totals.orders);
    printRow("销售额(不含税) Sales", totals.salesCents);

    chunks.push(encLine(makeLine("-")));

    printRow("合计税费 Tax", totals.taxCents);
    printRow("合计配送费 D.Fee", totals.deliveryFeeCents || 0);
    printRow("合计Uber费用 UberCost", totals.deliveryCostCents || 0);

    chunks.push(encLine(makeLine("=")));

    chunks.push(cmd(ESC, 0x45, 0x01)); // Bold
    chunks.push(cmd(GS, 0x21, 0x01)); // Double Height
    const totalLabel = padRight("总营业额 Total", 14);
    const totalVal = padLeft(money(totals.netCents), LINE_WIDTH - 14);
    chunks.push(encLine(totalLabel + totalVal));
    chunks.push(cmd(GS, 0x21, 0x00));
    chunks.push(cmd(ESC, 0x45, 0x00));
  }

  chunks.push(encLine(""));
  chunks.push(encLine(`打印时间: ${formatPrintTime()}`));
  chunks.push(encLine(""));
  chunks.push(encLine(""));

  chunks.push(cmd(GS, 0x56, 0x42, 0x00)); // Cut
  return Buffer.concat(chunks);
}

// ========== Express 服务（必须先初始化 app，再注册路由）=========

const app = express();
app.use(bodyParser.json());

// CORS：允许网页访问本地 19191 端口
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Content-Type");
  res.header("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }
  next();
});

// 探活接口
app.get("/ping", (req, res) => {
  res.send("POS ESC/POS printer server is running");
});

// 汇总打印接口
app.post("/print-summary", async (req, res) => {
  const payload = req.body;
  console.log("[/print-summary] 收到打印请求");
  try {
    const dataBuffer = buildSummaryReceiptEscPos(payload);
    await printEscPosTo(FRONT_PRINTER, dataBuffer);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: String(err) });
  }
});

// 主打印接口
app.post("/print-pos", async (req, res) => {
  const payload = req.body;
  const { locale, orderNumber, pickupCode, fulfillment, paymentMethod, snapshot, targets } = payload || {};

  console.log(
    "[/print-pos] 收到打印请求:",
    JSON.stringify(
      {
        orderNumber,
        pickupCode,
        fulfillment,
        paymentMethod,
        itemCount: snapshot?.items?.length ?? 0,
      },
      null,
      2
    )
  );

  if (!snapshot || !Array.isArray(snapshot.items)) {
    console.error("[/print-pos] 缺少 snapshot.items");
    return res.status(400).json({ error: "Missing snapshot.items in payload" });
  }

  try {
    const customerData = await buildCustomerReceiptEscPos({
      locale,
      orderNumber,
      pickupCode,
      fulfillment,
      paymentMethod,
      snapshot,
    });

    const kitchenData = buildKitchenReceiptEscPos({
      locale,
      orderNumber,
      fulfillment,
      snapshot,
    });

    const targetCustomer = targets?.customer ?? true;
    const targetKitchen = targets?.kitchen ?? true;
    const tasks = [];

    if (targetCustomer) {
      tasks.push(printEscPosTo(FRONT_PRINTER, customerData));
    }
    if (targetKitchen) {
      tasks.push(printEscPosTo(KITCHEN_PRINTER, kitchenData));
    }

    await Promise.all(tasks);

    console.log("[/print-pos] 已发送 ESC/POS 数据到打印机");
    res.json({ ok: true });
  } catch (err) {
    console.error("[/print-pos] 打印过程中出错:", err);
    res.status(500).json({ error: String(err) });
  }
});

const PORT = process.env.POS_PRINTER_PORT || 19191;

app.listen(PORT, () => {
  console.log(`POS ESC/POS printer server listening on http://127.0.0.1:${PORT}`);
  console.log("Front printer logical name:", FRONT_PRINTER || "(system default)");
  console.log("Kitchen printer logical name:", KITCHEN_PRINTER || "(same as front)");
});

// ============================================================
// 🚀 云端自动接单模块 (Cloud Auto-Print)
// ============================================================

const API_URL = process.env.API_URL || 'http://localhost:3000'; // 你的 NestJS 地址
const STORE_ID = process.env.STORE_ID; // 必须与后端 .env 一致

if (STORE_ID) {
  console.log(`\n☁️  正在连接云端 POS 网关...`);
  console.log(`   目标: ${API_URL}/pos`);
  console.log(`   门店: ${STORE_ID}\n`);

  // 连接到 /pos 命名空间
  const socket = io(`${API_URL}/pos`, {
    transports: ['websocket'],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 5000,
  });

  // 1. 连接成功
  socket.on('connect', () => {
    console.log(`✅ [Cloud] 已连接到服务器! Socket ID: ${socket.id}`);
    // 立即加入门店房间
    socket.emit('joinStore', { storeId: STORE_ID });
  });

  // 2. 连接断开
  socket.on('disconnect', (reason) => {
    console.warn(`❌ [Cloud] 连接断开: ${reason}`);
  });

  // 3. 监听打印任务 (核心修改版)
  socket.on('PRINT_JOB', async (backendOrder) => {
    // 打印日志方便调试
    const orderId = backendOrder.clientRequestId || backendOrder.orderStableId || backendOrder.id;
    console.log(`\n🖨️  [Cloud] 收到新订单: ${orderId}`);

    try {
      // ============================================================
      // 🛠️ 步骤 1: 数据适配 (Adapter)
      // 将后端 Prisma 数据转换为打印函数期待的 "Legacy Frontend" 格式
      // ============================================================
      
      // 处理选项 (Options) 的辅助函数
      const resolveOptions = (optionsJson) => {
        if (!optionsJson) return [];
        if (Array.isArray(optionsJson)) {
          // 如果是数组，可能是字符串数组或对象数组
          return optionsJson.map(opt => {
            if (typeof opt === 'string') return opt;
            return opt.name || opt.label || JSON.stringify(opt);
          });
        }
        return [];
      };

      const legacyPayload = {
        // 1. 基础字段映射
        orderNumber: orderId,
        pickupCode: backendOrder.pickupCode,
        fulfillment: backendOrder.fulfillmentType, 
        paymentMethod: backendOrder.paymentMethod, 
        
        // 2. 构造 snapshot 对象 (你的打印函数完全依赖这个)
        snapshot: {
          // 金额字段 (直接透传后端的 Cents，你的 money() 函数会除以 100)
          totalCents: backendOrder.totalCents, 
          subtotalCents: backendOrder.subtotalCents,
          taxCents: backendOrder.taxCents,
          discountCents: backendOrder.couponDiscountCents || 0,
          deliveryFeeCents: backendOrder.deliveryFeeCents || 0,
          deliveryCostCents: backendOrder.deliveryCostCents,
          deliverySubsidyCents: backendOrder.deliverySubsidyCents,
          tipCents: backendOrder.tipCents || 0,
          
          // 积分 (如果有)
          loyalty: {
             pointsRedeemed: backendOrder.loyaltyRedeemCents ? backendOrder.loyaltyRedeemCents / 100 : 0,
             // pointsEarned: 后端暂未透传，可留空
          },
          
          // 商品列表映射
          items: (backendOrder.items || []).map(item => ({
            // 名称映射：优先用中文名，没有则用 displayName
            nameZh: item.nameZh || item.displayName, 
            nameEn: item.nameEn,
            // 数量
            quantity: item.qty,
            // 行总价 = 单价 * 数量 (你的函数用的是 lineTotalCents)
            lineTotalCents: (item.unitPriceCents || 0) * (item.qty || 1), 
            // 选项/配料
            options: resolveOptions(item.optionsJson) 
          })),
        }
      };

      // ============================================================
      // 🖨️ 步骤 2: 前台打印 (收银小票)
      // ============================================================
      const frontPrinterName = process.env.POS_FRONT_PRINTER || "POS80";
      
      if (frontPrinterName) {
        console.log(`➡️  正在发送前台收据 -> ${frontPrinterName}`);
        // 调用你已有的函数生成 Buffer
        const receiptBuffer = await buildCustomerReceiptEscPos(legacyPayload);
        await printEscPosTo(frontPrinterName, receiptBuffer);
      } else {
        console.warn(`⚠️  未配置前台打印机 (POS_FRONT_PRINTER)`);
      }

      // ============================================================
      // 👨‍🍳 步骤 3: 后厨打印 (厨房切单)
      // ============================================================
      const kitchenPrinterName = process.env.POS_KITCHEN_PRINTER;
      
      if (kitchenPrinterName) {
        console.log(`➡️  正在发送后厨切单 -> ${kitchenPrinterName}`);
        
        // 调用你已有的后厨函数生成 Buffer
        const kitchenBuffer = buildKitchenReceiptEscPos(legacyPayload);
        await printEscPosTo(kitchenPrinterName, kitchenBuffer);
        
      } else {
        console.log(`ℹ️  未配置后厨打印机 (POS_KITCHEN_PRINTER)，跳过。`);
      }

      console.log(`✅ [Cloud] 打印任务全部完成`);

    } catch (err) {
      console.error(`❌ [Cloud] 打印处理失败:`, err);
    }
  });

} else {
  console.warn(`⚠️  [Cloud] 未配置 STORE_ID，云端自动接单功能未启动。`);
}