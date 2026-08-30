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
const http = require("http");
const https = require("https");
const os = require("os");
const path = require("path");
const { exec, execFile } = require("child_process");
const iconv = require("iconv-lite");
const { Jimp } = require("jimp");
const io = require("socket.io-client");
require("dotenv").config();
// === 打印机配置 ===
// 可以通过环境变量覆盖：POS_FRONT_PRINTER / POS_KITCHEN_PRINTER / POS_LABEL_PRINTER
// 注意：这里的名字建议用 Windows 打印机名或共享名，例如 POS80、KITCHEN、LABEL 等
const FRONT_PRINTER = process.env.POS_FRONT_PRINTER || "POS80";
const KITCHEN_PRINTER = process.env.POS_KITCHEN_PRINTER || "KC80";

// === ESC/POS 常量 ===
const ESC = 0x1b;
const GS = 0x1d;

// 80mm 打印机 Font A 通常可打印 48 个半角字符；此前 32 只覆盖约 2/3 纸宽。
const LINE_WIDTH = 48;
const CUSTOMER_LINE_SPACING_DOTS = 48;
const KITCHEN_LINE_SPACING_DOTS = 48;
const LOGO_WIDTH_DOTS = Number(process.env.POS_LOGO_WIDTH_DOTS || 192);

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

function pickLocalizedName(value, locale, fallback = "") {
  if (!value || typeof value !== "object") return String(fallback || "").trim();
  const zh = typeof value.nameZh === "string" ? value.nameZh.trim() : "";
  const en = typeof value.nameEn === "string" ? value.nameEn.trim() : "";
  const display =
    typeof value.displayName === "string" ? value.displayName.trim() : "";
  const stableId =
    typeof value.productStableId === "string"
      ? value.productStableId.trim()
      : typeof value.stableId === "string"
        ? value.stableId.trim()
        : "";
  return locale === "zh"
    ? zh || display || en || stableId || fallback
    : en || display || zh || stableId || fallback;
}

function pickBilingualNames(value) {
  if (!value || typeof value !== "object") return [];
  const zh = typeof value.nameZh === "string" ? value.nameZh.trim() : "";
  const en = typeof value.nameEn === "string" ? value.nameEn.trim() : "";
  const display =
    typeof value.displayName === "string" ? value.displayName.trim() : "";
  const stableId =
    typeof value.productStableId === "string"
      ? value.productStableId.trim()
      : typeof value.stableId === "string"
        ? value.stableId.trim()
        : "";
  return [
    ...new Set(
      [zh, en].filter(Boolean).length
        ? [zh, en].filter(Boolean)
        : [display || stableId].filter(Boolean),
    ),
  ];
}

function getReceiptPaymentLabel(paymentMethod) {
  if (paymentMethod === "card") return "银行卡 Card";
  if (paymentMethod === "cash") return "现金 Cash";
  if (paymentMethod === "wechat_alipay") return "微信/支付宝 WeChat/Alipay";
  if (paymentMethod === "ubereats") return "Uber Eats";
  return "外部支付 External Payment";
}

function getReceiptDiscountLabel(discount) {
  if (!discount || typeof discount !== "object") return "其他优惠 Other discount";
  const titleZh =
    typeof discount.titleZh === "string" ? discount.titleZh.trim() : "";
  const titleEn =
    typeof discount.titleEn === "string" ? discount.titleEn.trim() : "";
  const title = typeof discount.title === "string" ? discount.title.trim() : "";
  if (discount.source === "DAILY_SPECIAL") {
    const itemNames = pickBilingualNames({
      nameZh: discount.productNameZh,
      nameEn: discount.productNameEn,
      displayName: discount.productName,
      productStableId: discount.productStableId,
    }).join(" / ");
    return itemNames
      ? `每日特价 Daily special · ${itemNames}`
      : "每日特价 Daily special";
  }
  const localizedTitles = [...new Set([titleZh, titleEn, title].filter(Boolean))];
  if (localizedTitles.length > 0) return localizedTitles.join(" / ");
  if (discount.source === "COUPON") return "优惠券 Coupon";
  if (discount.source === "POS_MANUAL_DISCOUNT") {
    return "人工折扣 Manual discount";
  }
  if (discount.source === "AUTOMATIC_PROMOTION") {
    return "活动优惠 Promotion";
  }
  return "其他优惠 Other discount";
}

function getOptionLines(
  item,
  { locale = "zh", bilingual = false, includePrice = true } = {},
) {
  if (!item || typeof item !== "object") return [];
  if (!Array.isArray(item.options)) return [];

  return item.options.flatMap((group) => {
    if (!group || typeof group !== "object") return [];

    const choices = Array.isArray(group.choices) ? group.choices : [];
    return choices
      .map((choice) => {
        if (!choice || typeof choice !== "object") return "";
        const priceDeltaCents =
          typeof choice.priceDeltaCents === "number" &&
          Number.isFinite(choice.priceDeltaCents)
            ? Math.round(choice.priceDeltaCents)
            : 0;

        const priceSuffix =
          includePrice && priceDeltaCents !== 0
            ? ` (${priceDeltaCents > 0 ? "+" : "-"}${money(Math.abs(priceDeltaCents))})`
            : "";

        const name = bilingual
          ? pickBilingualNames(choice).join(" ")
          : pickLocalizedName(choice, locale);
        return name ? `${name}${priceSuffix}` : "";
      })
      .filter(Boolean);
  });
}

function receiptTextWidth(value) {
  return iconv.encode(String(value ?? ""), "gbk").length;
}

function takeReceiptTextSegment(value, maxWidth) {
  const text = String(value ?? "");
  let usedWidth = 0;
  let endIndex = 0;

  for (const character of text) {
    const characterWidth = Math.max(1, receiptTextWidth(character));
    if (endIndex > 0 && usedWidth + characterWidth > maxWidth) break;
    usedWidth += characterWidth;
    endIndex += character.length;
    if (usedWidth >= maxWidth) break;
  }

  return [text.slice(0, endIndex), text.slice(endIndex)];
}

function wrapReceiptText(prefix, value, width = LINE_WIDTH) {
  const cleanPrefix = String(prefix ?? "");
  const cleanValue = String(value ?? "").trim();
  if (!cleanValue) return [];

  const paragraphs = cleanValue
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const lines = [];
  let isFirstOutputLine = true;

  paragraphs.forEach((paragraph) => {
    let remaining = paragraph;

    while (remaining.length > 0) {
      const linePrefix = isFirstOutputLine ? cleanPrefix : "  ";
      const availableWidth = Math.max(
        8,
        width - receiptTextWidth(linePrefix),
      );
      const [segment, rest] = takeReceiptTextSegment(
        remaining,
        availableWidth,
      );
      lines.push(`${linePrefix}${segment}`);
      remaining = rest;
      isFirstOutputLine = false;
    }
  });

  return lines;
}

function extractUtensilsSummaryFromOrderNoteLine(value) {
  const line = String(value ?? "").trim();
  const match = line.match(
    /^(?:餐具\s*\/\s*Utensils|Utensils|餐具)\s*:\s*(.+)$/i,
  );
  return match?.[1]?.trim() || null;
}

function buildCustomerServiceNoteBlockLines(params) {
  const utensils =
    params?.utensils && typeof params.utensils === "object"
      ? params.utensils
      : null;
  const orderNotes =
    typeof params?.orderNotes === "string" ? params.orderNotes.trim() : "";

  const lines = [];
  const seenUtensils = new Set();
  const appendUtensilsChoice = (value) => {
    const normalizedValue = String(value ?? "").trim();
    if (!normalizedValue || seenUtensils.has(normalizedValue)) return;
    seenUtensils.add(normalizedValue);
    lines.push({
      kind: "utensils-choice",
      label: "餐具 / Utensils: ",
      value: normalizedValue,
    });
  };

  if (utensils && typeof utensils.needed === "boolean") {
    appendUtensilsChoice(utensils.needed ? "是 / Yes" : "否 / No");

    if (utensils.needed) {
      const typeLabel =
        utensils.type === "chopsticks"
          ? "筷子 / Chopsticks"
          : utensils.type === "fork"
            ? "叉子 / Fork"
            : "";
      if (typeLabel) {
        lines.push({
          kind: "utensils-detail",
          text: `类型 / Type: ${typeLabel}`,
        });
      }

      const quantity = Number(utensils.quantity);
      if (Number.isFinite(quantity) && quantity > 0) {
        lines.push({
          kind: "utensils-sets",
          text: `# Sets / 套: ${Math.round(quantity)}`,
        });
      }
    }
  } else {
    const utensilsSummary =
      typeof utensils?.summary === "string" ? utensils.summary.trim() : "";
    if (utensilsSummary) appendUtensilsChoice(utensilsSummary);
  }

  if (orderNotes) {
    let orderNotePrefixUsed = false;
    orderNotes
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .forEach((orderNoteLine) => {
        const embeddedUtensilsSummary =
          extractUtensilsSummaryFromOrderNoteLine(orderNoteLine);
        if (embeddedUtensilsSummary) {
          appendUtensilsChoice(embeddedUtensilsSummary);
          return;
        }

        const prefix = orderNotePrefixUsed
          ? "  "
          : "订单备注 / Order Notes: ";
        wrapReceiptText(prefix, orderNoteLine).forEach((text) => {
          lines.push({ kind: "note", text });
        });
        orderNotePrefixUsed = true;
      });
  }

  return lines;
}

function getItemSpecialInstructionLines(item, locale) {
  const instructions =
    typeof item?.specialInstructions === "string"
      ? item.specialInstructions.trim()
      : "";
  if (!instructions) return [];
  return wrapReceiptText(
    locale === "en" ? "  Note: " : "  备注: ",
    instructions,
  );
}

// PNG/JPG -> ESC/POS Raster Bit Image (GS v 0)
async function escposRasterFromImage(
  filePath,
  targetWidthDots = LOGO_WIDTH_DOTS,
) {
  try {
    // 1. 读取图片
    const img = await Jimp.read(filePath);

    // 2. ⚠️【核心修复】计算高度并使用对象传参 (适配 Jimp v1.6.0+)
    // 旧版: img.resize(w, -1)
    // 新版: img.resize({ w: w }) 或者需要显式计算高度
    const srcW = img.width; // v1 直接用属性，不再是 bitmap.width
    const srcH = img.height;
    const aspect = srcH / srcW;
    const targetHeight = Math.round(targetWidthDots * aspect);

    // 执行缩放 (注意：v1 里的操作可能是异步的，建议 await)
    await img.resize({ w: targetWidthDots, h: targetHeight });

    // 3. 转灰度
    await img.greyscale();

    const w = img.width;
    const h = img.height;

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
            // ⚠️【核心修复】手动位运算获取颜色 (因为 Jimp.intToRGBA 已移除)
            const color = img.getPixelColor(x, y);
            // Jimp 颜色是 0xRRGGBBAA，我们取 R 即可 (灰度图 R=G=B)
            const r = (color >> 24) & 0xff;
            v = r;
          }
          // 黑点=1（阈值以下当黑）
          if (v < threshold) b |= 0x80 >> bit;
        }
        data[offset++] = b;
      }
    }

    // GS v 0 协议头
    const xL = bytesPerRow & 0xff;
    const xH = (bytesPerRow >> 8) & 0xff;
    const yL = h & 0xff;
    const yH = (h >> 8) & 0xff;

    return Buffer.concat([
      cmd(GS, 0x76, 0x30, 0x00, xL, xH, yL, yH),
      data,
      encLine(""),
    ]);
  } catch (err) {
    // 打印更详细的错误信息
    const msg = err.issues ? JSON.stringify(err.issues, null, 2) : err.message;
    console.warn(`[Logo] Picture cannot be processed. (${filePath}):`, msg);
    return Buffer.alloc(0); // 失败返回空，不阻断打印
  }
}

// 将 ESC/POS 原始数据发送到指定打印机
function printEscPosTo(printerName, dataBuffer) {
  return new Promise((resolve, reject) => {
    const tmpFile = path.join(
      os.tmpdir(),
      `pos-escpos-${Date.now()}-${Math.random().toString(16).slice(2)}.bin`,
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

      console.log("[printEscPosTo] command:", cmdStr);

      exec(cmdStr, (error, stdout, stderr) => {
        // 打印完删除临时文件
        fs.unlink(tmpFile, () => {});

        if (error) {
          console.error("[printEscPosTo] copy /B 打印报错:", error);
          if (stderr) console.error("[printEscPosTo] stderr:", stderr);
          return reject(error);
        }

        if (stderr) {
          console.warn(
            "[printEscPosTo] Print command stderr:",
            stderr.toString().trim(),
          );
        }

        console.log(
          "[printEscPosTo] Print command stdout:",
          (stdout || "").toString().trim(),
        );
        resolve();
      });
    });
  });
}

// ========== ESC/POS 小票内容生成 ==========

// 顾客联
async function buildCustomerReceiptEscPos(params) {
  const { orderNumber, pickupCode, fulfillment, paymentMethod, snapshot } =
    params;
  const locale = params.locale === "en" ? "en" : "zh";
  const customerName =
    typeof params.customerName === "string" ? params.customerName.trim() : "";

  const f = String(fulfillment || "").toLowerCase();
  const isDelivery = f === "delivery";

  const dineZh = isDelivery ? "配送" : f === "pickup" ? "外带" : "堂食";
  const dineEn = isDelivery
    ? "DELIVERY"
    : f === "pickup"
      ? "TAKE-OUT"
      : "DINE-IN";

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
          : normalizedPm === "ubereats"
            ? "Uber Eats"
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
          : normalizedPm === "ubereats"
            ? "Uber Eats"
            : normalizedPm === "store_balance" || normalizedPm === "balance"
              ? "Store Balance"
              : "Other";

  const chunks = [];

  // 初始化打印机
  chunks.push(cmd(ESC, 0x40)); // ESC @

  // 48 dots 给双高字体留足垂直空间，避免相邻行贴得过紧。
  chunks.push(cmd(ESC, 0x33, CUSTOMER_LINE_SPACING_DOTS));

  // ==== 顾客姓名（如果有的话） ====
  if (customerName) {
    chunks.push(cmd(ESC, 0x61, 0x01)); // 居中
    chunks.push(cmd(ESC, 0x45, 0x01)); // 加粗
    chunks.push(encLine(`顾客 / Customer: ${customerName}`));
    chunks.push(cmd(ESC, 0x45, 0x00));
    chunks.push(encLine(""));
  }

  // ==== 取餐码（如果有的话） ====
  if (pickupCode) {
    // 仿 Uber Eats 小票：取消标题，整行反白并居中显示取餐码。
    // 双倍宽度下一行可容纳 LINE_WIDTH / 2 个单字节字符。
    const pickupCodeText = String(pickupCode).trim();
    const pickupCodeLineWidth = Math.floor(LINE_WIDTH / 2);
    const pickupCodePadding = Math.max(
      0,
      pickupCodeLineWidth - pickupCodeText.length,
    );
    const pickupCodeLine = `${" ".repeat(Math.floor(pickupCodePadding / 2))}${pickupCodeText}${" ".repeat(Math.ceil(pickupCodePadding / 2))}`;

    chunks.push(cmd(ESC, 0x61, 0x01)); // ESC a 1 -> 居中
    chunks.push(cmd(GS, 0x21, 0x11)); // GS ! 0x11 -> 双倍宽高
    chunks.push(cmd(GS, 0x42, 0x01)); // GS B 1 -> 黑底白字
    chunks.push(encLine(pickupCodeLine));
    chunks.push(cmd(GS, 0x42, 0x00)); // GS B 0 -> 恢复黑字白底
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
  chunks.push(encLine("www.sanq.ca"));
  chunks.push(cmd(GS, 0x21, 0x00)); // 恢复正常大小
  chunks.push(cmd(ESC, 0x45, 0x00)); // 取消加粗

  // ==== Logo（可选） ====
  try {
    const logoPath =
      process.env.POS_LOGO_PATH || path.join(__dirname, "assets", "logo.png");
    if (fs.existsSync(logoPath)) {
      chunks.push(cmd(ESC, 0x61, 0x01)); // 居中
      const logoBuf = await escposRasterFromImage(logoPath, LOGO_WIDTH_DOTS);
      chunks.push(logoBuf);
      chunks.push(encLine("扫码访问 Review Us"));
      chunks.push(cmd(ESC, 0x61, 0x00)); // 左对齐
    } else {
      console.warn("[logo] No logo picture found，pass:", logoPath);
    }
  } catch (e) {
    console.warn("[logo] Print logo failed，pass:", e?.message || e);
  }
  chunks.push(cmd(ESC, 0x61, 0x00)); // 左对齐

  const serviceNoteBlockLines = buildCustomerServiceNoteBlockLines(params);
  if (serviceNoteBlockLines.length > 0) {
    chunks.push(encLine(makeLine("-")));
    chunks.push(cmd(ESC, 0x45, 0x01)); // 备注加粗
    chunks.push(cmd(GS, 0x21, 0x01)); // 双高但不加宽，保持整行可读宽度
    serviceNoteBlockLines.forEach((line) => {
      if (line.kind === "utensils-choice") {
        // 标题保持白底黑字，只反白具体选择，例如“是 / Yes”。
        chunks.push(iconv.encode(line.label, "gbk"));
        chunks.push(cmd(GS, 0x42, 0x01));
        chunks.push(encLine(line.value));
        chunks.push(cmd(GS, 0x42, 0x00));
        return;
      }
      if (line.kind === "utensils-sets") {
        // 套数属于具体餐具信息，整段反白突出。
        chunks.push(cmd(GS, 0x42, 0x01));
        chunks.push(encLine(line.text));
        chunks.push(cmd(GS, 0x42, 0x00));
        return;
      }
      chunks.push(encLine(line.text));
    });
    chunks.push(cmd(GS, 0x42, 0x00)); // safety: ensure reverse mode is off
    chunks.push(cmd(GS, 0x21, 0x00));
    chunks.push(cmd(ESC, 0x45, 0x00));
    chunks.push(encLine(makeLine("-")));
  } else {
    chunks.push(encLine(makeLine("-")));
  }

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
      const itemNames = pickBilingualNames(item);

      // 菜名：加粗 + 双倍高度
      chunks.push(cmd(ESC, 0x45, 0x01)); // bold on
      chunks.push(cmd(GS, 0x21, 0x01)); // double-height only

      itemNames.forEach((name) => chunks.push(encLine(name)));

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
      const optionLines = getOptionLines(item, { bilingual: true });

      if (optionLines.length > 0) {
        optionLines.forEach((opt) => {
          chunks.push(encLine(`  - ${opt}`));
        });
      }

      if (Array.isArray(item.components) && item.components.length > 0) {
        chunks.push(encLine("  套餐包含 / Includes:"));
        item.components.forEach((component) => {
          const componentNames = pickBilingualNames(component).join(" / ");
          const componentQty = Number.isFinite(component?.quantity)
            ? Math.max(1, Math.round(component.quantity))
            : 1;
          const componentPriceDelta = Number.isFinite(component?.priceDeltaCents)
            ? Math.round(component.priceDeltaCents)
            : 0;
          const componentPriceSuffix =
            componentPriceDelta !== 0
              ? ` (${componentPriceDelta > 0 ? "+" : "-"}${money(Math.abs(componentPriceDelta))})`
              : "";
          wrapReceiptText(
            `  > x${componentQty} `,
            `${componentNames}${componentPriceSuffix}`,
          ).forEach(
            (line) => chunks.push(encLine(line)),
          );
          getOptionLines(component, { bilingual: true }).forEach((opt) => {
            chunks.push(encLine(`    - ${opt}`));
          });
        });
      }

      getItemSpecialInstructionLines(item, locale).forEach((line) => {
        chunks.push(encLine(line));
      });

      chunks.push(encLine(""));
    });
  }

  // ==== 金额汇总 ====
  const subtotal = snapshot.displaySubtotalCents ?? snapshot.subtotalCents ?? 0;
  const appliedDiscounts = Array.isArray(snapshot.appliedDiscounts)
    ? snapshot.appliedDiscounts
    : [];
  const loyaltyRedeemCents = Number.isFinite(snapshot.loyaltyRedeemCents)
    ? Math.max(0, Math.round(snapshot.loyaltyRedeemCents))
    : 0;
  const legacyDiscount = Math.max(
    0,
    Math.round(snapshot.discountCents ?? 0) - loyaltyRedeemCents,
  );
  const tax = snapshot.taxCents ?? 0;
  const creditCardSurcharge = snapshot.creditCardSurchargeCents ?? 0;
  const orderTotal =
    snapshot.orderTotalCents ??
    Math.max(0, (snapshot.totalCents ?? 0) - creditCardSurcharge);
  const balancePaid = Number.isFinite(snapshot.balancePaidCents)
    ? Math.max(0, Math.round(snapshot.balancePaidCents))
    : 0;
  const externalPaid = Number.isFinite(snapshot.externalPaidCents)
    ? Math.max(0, Math.round(snapshot.externalPaidCents))
    : Math.max(0, orderTotal - balancePaid);
  const total = snapshot.totalCents ?? orderTotal + creditCardSurcharge;
  const cashReceivedCents = Number.isFinite(params.cashReceivedCents)
    ? Math.max(0, Math.round(params.cashReceivedCents))
    : 0;
  const cashChangeCents = Number.isFinite(params.cashChangeCents)
    ? Math.max(0, Math.round(params.cashChangeCents))
    : 0;
  const loyalty = snapshot.loyalty || {};
  const deliveryFee = snapshot.deliveryFeeCents ?? 0;

  chunks.push(encLine(makeLine("-")));
  chunks.push(encLine(`商品小计 Subtotal: ${money(subtotal)}`));
  if (appliedDiscounts.length > 0) {
    appliedDiscounts.forEach((discount) => {
      const discountCents = Number.isFinite(discount?.discountCents)
        ? Math.max(0, Math.round(discount.discountCents))
        : 0;
      if (discountCents <= 0) return;
      wrapReceiptText("优惠 Discount · ", getReceiptDiscountLabel(discount)).forEach(
        (line) => chunks.push(encLine(line)),
      );
      chunks.push(encLine(`  -${money(discountCents)}`));
    });
  } else if (legacyDiscount > 0) {
    chunks.push(encLine(`折扣/优惠 Discount: -${money(legacyDiscount)}`));
  }
  if (loyaltyRedeemCents > 0) {
    chunks.push(encLine(`积分抵扣 Points: -${money(loyaltyRedeemCents)}`));
  } else if (
    typeof loyalty.pointsRedeemed === "number" &&
    loyalty.pointsRedeemed > 0
  ) {
    chunks.push(
      encLine(`积分抵扣 Points: -${loyalty.pointsRedeemed.toFixed(2)} pt`),
    );
  }

  if (isDelivery || deliveryFee > 0) {
    chunks.push(encLine(`配送费(顾客) Delivery Fee: ${money(deliveryFee)}`));
  }

  chunks.push(encLine(`税费(HST) Tax: ${money(tax)}`));
  chunks.push(encLine(`订单总额 Order Total: ${money(orderTotal)}`));
  if (balancePaid > 0) {
    chunks.push(encLine(`储值余额 Stored Balance: -${money(balancePaid)}`));
  }
  if (externalPaid > 0 && (balancePaid > 0 || creditCardSurcharge > 0)) {
    chunks.push(
      encLine(`${getReceiptPaymentLabel(paymentMethod)}: ${money(externalPaid)}`),
    );
  }
  if (creditCardSurcharge > 0) {
    chunks.push(
      encLine(`信用卡附加费 Card Surcharge: ${money(creditCardSurcharge)}`),
    );
    chunks.push(encLine(`最终支付 Total Paid: ${money(total)}`));
  }
  if (cashReceivedCents > 0) {
    chunks.push(encLine(`实收 Paid:    ${money(cashReceivedCents)}`));
  }
  if (cashChangeCents > 0) {
    chunks.push(encLine(`找零 Change:  ${money(cashChangeCents)}`));
  }

  if (typeof loyalty.pointsEarned === "number" && loyalty.pointsEarned > 0) {
    chunks.push(
      encLine(`本单新增积分 Earned: +${loyalty.pointsEarned.toFixed(2)} pt`),
    );
  }
  if (typeof loyalty.pointsBalanceAfter === "number") {
    chunks.push(
      encLine(
        `结算后积分 Balance: ${loyalty.pointsBalanceAfter.toFixed(2)} pt`,
      ),
    );
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
  const locale = params.locale === "en" ? "en" : "zh";

  const dineZh =
    fulfillment === "delivery"
      ? "配送"
      : fulfillment === "pickup"
        ? "外带"
        : "堂食";
  const dineEn =
    fulfillment === "delivery"
      ? "DELIVERY"
      : fulfillment === "pickup"
        ? "TAKE-OUT"
        : "DINE-IN";

  const chunks = [];

  // 初始化打印机
  chunks.push(cmd(ESC, 0x40)); // ESC @
  chunks.push(cmd(ESC, 0x33, KITCHEN_LINE_SPACING_DOTS));

  // ==== 顶部：用餐方式（大号加粗） ====
  chunks.push(cmd(ESC, 0x61, 0x01)); // 居中
  chunks.push(cmd(ESC, 0x45, 0x01)); // 加粗
  chunks.push(cmd(GS, 0x21, 0x11)); // 双倍宽高
  chunks.push(encLine(locale === "zh" ? dineZh : dineEn));
  chunks.push(cmd(GS, 0x21, 0x00)); // 恢复正常大小
  chunks.push(cmd(ESC, 0x45, 0x00)); // 取消加粗
  chunks.push(encLine(""));
  chunks.push(cmd(ESC, 0x61, 0x00)); // 左对齐
  chunks.push(encLine(makeLine("=")));

  // ==== 菜品（放大 + 加粗） ====
  if (Array.isArray(snapshot.items)) {
    snapshot.items.forEach((item) => {
      const itemName = pickLocalizedName(item, locale);
      const qty = item.quantity ?? 0;

      chunks.push(cmd(ESC, 0x45, 0x01)); // 加粗
      chunks.push(cmd(GS, 0x21, 0x11)); // 双倍高度

      if (itemName) {
        chunks.push(encLine(`${qty}  ${itemName}`));
      }

      chunks.push(cmd(GS, 0x21, 0x00));
      chunks.push(cmd(ESC, 0x45, 0x00));

      const optionLines = getOptionLines(item, {
        locale,
        includePrice: false,
      });
      if (optionLines.length > 0) {
        chunks.push(cmd(ESC, 0x45, 0x01)); // 加粗
        chunks.push(cmd(GS, 0x21, 0x01)); // 比菜名略小（双高、非双宽）
        optionLines.forEach((opt) => {
          chunks.push(encLine(`  - ${opt}`));
        });
        chunks.push(cmd(GS, 0x21, 0x00));
        chunks.push(cmd(ESC, 0x45, 0x00));
      }
      if (Array.isArray(item.components) && item.components.length > 0) {
        chunks.push(cmd(ESC, 0x45, 0x01));
        item.components.forEach((component) => {
          const componentName = pickLocalizedName(component, locale);
          const componentQty = Number.isFinite(component?.quantity)
            ? Math.max(1, Math.round(component.quantity))
            : 1;
          if (componentName) {
            chunks.push(encLine(`  > ${componentQty}  ${componentName}`));
          }
          getOptionLines(component, {
            locale,
            includePrice: false,
          }).forEach((opt) => {
            chunks.push(encLine(`    - ${opt}`));
          });
        });
        chunks.push(cmd(ESC, 0x45, 0x00));
      }
      const specialInstructionLines = getItemSpecialInstructionLines(
        item,
        locale,
      );
      if (specialInstructionLines.length > 0) {
        chunks.push(cmd(ESC, 0x45, 0x01));
        chunks.push(cmd(GS, 0x21, 0x01)); // 菜品备注双高显示
        specialInstructionLines.forEach((line) => chunks.push(encLine(line)));
        chunks.push(cmd(GS, 0x21, 0x00));
        chunks.push(cmd(ESC, 0x45, 0x00));
      }

      chunks.push(encLine(""));
    });
  }

  // ==== 底部 ====
  chunks.push(encLine(makeLine("-")));
  chunks.push(cmd(ESC, 0x61, 0x01)); // 居中
  chunks.push(encLine(locale === "zh" ? "后厨联" : "KITCHEN COPY"));
  chunks.push(
    encLine(`${locale === "zh" ? "打印时间" : "Print"}: ${formatPrintTime()}`),
  );
  chunks.push(encLine(""));
  chunks.push(cmd(ESC, 0x61, 0x00)); // 左对齐

  chunks.push(cmd(GS, 0x56, 0x42, 0x00));
  return Buffer.concat(chunks);
}

// ✅ 构建汇总小票函数
function buildSummaryReceiptEscPos(params) {
  const {
    date,
    totals,
    breakdownType,
    breakdownItems,
    breakdownByPayment,
    breakdownByFulfillment,
    breakdownByChannel,
  } = params;
  const chunks = [];

  const resolvedBreakdownType =
    breakdownType === "payment" ? "payment" : "channel";
  const resolvedBreakdownItems = Array.isArray(breakdownItems)
    ? breakdownItems
    : resolvedBreakdownType === "payment"
      ? breakdownByPayment
      : Array.isArray(breakdownByChannel)
        ? breakdownByChannel
        : breakdownByFulfillment;

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

  if (Array.isArray(resolvedBreakdownItems)) {
    chunks.push(cmd(ESC, 0x45, 0x01)); // Bold
    chunks.push(
      encLine(
        resolvedBreakdownType === "payment"
          ? "按支付方式汇总 (By Payment)"
          : "按渠道汇总 (By Channel)",
      ),
    );
    chunks.push(cmd(ESC, 0x45, 0x00));
    chunks.push(encLine("(金额: 实际收款 - 不含税)"));
    chunks.push(encLine(""));

    chunks.push(
      encLine(padRight("类别", 14) + padLeft("单数", 6) + padLeft("金额", 12)),
    );
    chunks.push(encLine(makeLine(".")));

    resolvedBreakdownItems.forEach((item) => {
      let label =
        item.label ||
        item.payment ||
        item.channel ||
        item.fulfillmentType ||
        "Unknown";
      if (!item.label && resolvedBreakdownType === "payment") {
        const paymentLabelMap = {
          cash: "现金 CASH",
          card: "刷卡 CARD",
          online: "线上 ONLINE",
          store_balance: "储值 STORE BAL",
        };
        label = paymentLabelMap[item.payment] || label;
      }
      if (!item.label && resolvedBreakdownType === "channel") {
        const channelLabelMap = {
          in_store: "门店 IN STORE",
          web: "网站 WEBSITE",
          ubereats: "网站 WEBSITE",
          dine_in: "堂食 DINE IN",
          pickup: "自取 PICKUP",
          delivery: "配送 DELIVERY",
        };
        label = channelLabelMap[item.channel || item.fulfillmentType] || label;
      }
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

    const printMoneyRow = (label, valCents) => {
      const l = padRight(label, 20);
      const v = padLeft(money(valCents), LINE_WIDTH - 20);
      chunks.push(encLine(l + v));
    };

    const printCountRow = (label, count) => {
      const l = padRight(label, 20);
      const v = padLeft(String(count ?? 0), LINE_WIDTH - 20);
      chunks.push(encLine(l + v));
    };

    printCountRow("总单量 Orders", totals.orders);
    printMoneyRow("销售额(不含税) Sales", totals.salesCents);

    chunks.push(encLine(makeLine("-")));

    printMoneyRow("合计税费 Tax", totals.taxCents);
    printMoneyRow("合计配送费 D.Fee", totals.deliveryFeeCents || 0);
    printMoneyRow("合计Uber费用 UberCost", totals.deliveryCostCents || 0);

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
  console.log("[/print-summary] Received print task");
  try {
    const dataBuffer = buildSummaryReceiptEscPos(payload);
    await printEscPosTo(FRONT_PRINTER, dataBuffer);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: String(err) });
  }
});

// 仅保留一个简单的探活接口，方便查看服务是否存活
app.get("/", (req, res) => res.send("Printer Server is Running (Cloud Mode)"));
app.listen(19191, () =>
  console.log("Local server is running, this is for health check."),
);

// ============================================================
// 🚀 云端自动接单模块 (Cloud Auto-Print)
// ============================================================

const API_URL = process.env.API_URL || "http://localhost:3000";
const STORE_ID = process.env.STORE_ID;
const POS_DEVICE_CREDENTIALS_FILE =
  process.env.POS_DEVICE_CREDENTIALS_FILE ||
  path.join(os.homedir(), ".sanq-printer-device.json");

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function assertSecureDeviceTransport(apiUrl) {
  const parsed = new URL(apiUrl);
  const isLoopback = ["localhost", "127.0.0.1", "::1"].includes(
    parsed.hostname,
  );
  if (parsed.protocol !== "https:" && !isLoopback) {
    throw new Error(
      "POS device credentials require HTTPS unless API_URL points to localhost",
    );
  }
}

function readStoredPosDeviceCredentials() {
  if (!fs.existsSync(POS_DEVICE_CREDENTIALS_FILE)) return null;
  try {
    const parsed = JSON.parse(
      fs.readFileSync(POS_DEVICE_CREDENTIALS_FILE, "utf8"),
    );
    if (
      isNonEmptyString(parsed?.deviceStableId) &&
      isNonEmptyString(parsed?.deviceKey)
    ) {
      return {
        deviceStableId: parsed.deviceStableId.trim(),
        deviceKey: parsed.deviceKey,
      };
    }
  } catch {
    console.warn(
      "[Cloud] Stored POS device credentials are unreadable; enrollment is required.",
    );
  }
  return null;
}

function persistPosDeviceCredentials(credentials) {
  const directory = path.dirname(POS_DEVICE_CREDENTIALS_FILE);
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(
    POS_DEVICE_CREDENTIALS_FILE,
    `${JSON.stringify(credentials)}\n`,
    { encoding: "utf8", mode: 0o600 },
  );
  try {
    fs.chmodSync(POS_DEVICE_CREDENTIALS_FILE, 0o600);
  } catch {
    // Windows may not apply POSIX mode bits; the file still remains local-only.
  }
}

function readSetCookieValue(setCookieHeaders, cookieName) {
  for (const header of setCookieHeaders) {
    const cookiePair = String(header).split(";", 1)[0];
    const separator = cookiePair.indexOf("=");
    if (separator <= 0) continue;
    if (cookiePair.slice(0, separator).trim() !== cookieName) continue;
    try {
      return decodeURIComponent(cookiePair.slice(separator + 1));
    } catch {
      return null;
    }
  }
  return null;
}

function claimPosDeviceCredentials(enrollmentCode) {
  const claimUrl = new URL(
    process.env.POS_DEVICE_CLAIM_URL || "/api/v1/pos/devices/claim",
    API_URL,
  );
  assertSecureDeviceTransport(claimUrl.toString());
  const requestBody = JSON.stringify({
    enrollmentCode,
    meta: { client: "printer-server", hostname: os.hostname() },
  });
  const transport = claimUrl.protocol === "https:" ? https : http;

  return new Promise((resolve, reject) => {
    const request = transport.request(
      claimUrl,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(requestBody),
        },
      },
      (response) => {
        const setCookieHeader = response.headers["set-cookie"];
        const setCookieHeaders = Array.isArray(setCookieHeader)
          ? setCookieHeader
          : setCookieHeader
            ? [setCookieHeader]
            : [];
        response.resume();
        response.on("end", () => {
          if (
            !response.statusCode ||
            response.statusCode < 200 ||
            response.statusCode >= 300
          ) {
            reject(
              new Error(
                `POS device enrollment failed with HTTP ${response.statusCode || "unknown"}`,
              ),
            );
            return;
          }

          const deviceStableId = readSetCookieValue(
            setCookieHeaders,
            "posDeviceId",
          );
          const deviceKey = readSetCookieValue(setCookieHeaders, "posDeviceKey");
          if (!deviceStableId || !deviceKey) {
            reject(
              new Error(
                "POS device enrollment response did not include device credentials",
              ),
            );
            return;
          }
          resolve({ deviceStableId, deviceKey });
        });
      },
    );

    request.setTimeout(10_000, () => {
      request.destroy(new Error("POS device enrollment request timed out"));
    });
    request.on("error", reject);
    request.write(requestBody);
    request.end();
  });
}

async function resolvePosDeviceCredentials() {
  const envDeviceStableId = process.env.POS_DEVICE_ID;
  const envDeviceKey = process.env.POS_DEVICE_KEY;
  if (envDeviceStableId || envDeviceKey) {
    if (!isNonEmptyString(envDeviceStableId) || !isNonEmptyString(envDeviceKey)) {
      throw new Error(
        "POS_DEVICE_ID and POS_DEVICE_KEY must be configured together",
      );
    }
    return {
      deviceStableId: envDeviceStableId.trim(),
      deviceKey: envDeviceKey,
    };
  }

  const storedCredentials = readStoredPosDeviceCredentials();
  if (storedCredentials) return storedCredentials;

  const enrollmentCode = process.env.POS_DEVICE_ENROLLMENT_CODE;
  if (!isNonEmptyString(enrollmentCode)) {
    throw new Error(
      "No POS device credentials found. Configure POS_DEVICE_ENROLLMENT_CODE once, or POS_DEVICE_ID + POS_DEVICE_KEY.",
    );
  }

  const claimedCredentials = await claimPosDeviceCredentials(
    enrollmentCode.trim(),
  );
  persistPosDeviceCredentials(claimedCredentials);
  console.log(
    `[Cloud] POS device enrollment completed; credentials stored at ${POS_DEVICE_CREDENTIALS_FILE}`,
  );
  return claimedCredentials;
}

async function printLabelPlanWithWindowsDriver(orderNumber, labelPlan) {
  const labels = Array.isArray(labelPlan?.labels) ? labelPlan.labels : [];
  if (labels.length === 0) return;

  const printerName = (process.env.POS_LABEL_PRINTER || "").trim();
  if (!printerName) {
    throw new Error("POS_LABEL_PRINTER_NOT_CONFIGURED");
  }

  const scriptPath = path.join(__dirname, "print-label.ps1");
  if (!fs.existsSync(scriptPath)) {
    throw new Error("POS_LABEL_PRINT_SCRIPT_MISSING");
  }

  const payloadPath = path.join(
    os.tmpdir(),
    `sanq-label-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}.json`,
  );
  const payload = {
    orderNumber: String(orderNumber || ""),
    labelWidthMm: Number(labelPlan?.labelWidthMm || 70),
    labelHeightMm: Number(labelPlan?.labelHeightMm || 30),
    labels,
  };
  await fs.promises.writeFile(payloadPath, JSON.stringify(payload), "utf8");

  try {
    await new Promise((resolve, reject) => {
      execFile(
        "powershell.exe",
        [
          "-NoProfile",
          "-NonInteractive",
          "-ExecutionPolicy",
          "Bypass",
          "-File",
          scriptPath,
          "-PrinterName",
          printerName,
          "-PayloadPath",
          payloadPath,
          "-FontName",
          process.env.POS_LABEL_FONT || "Microsoft YaHei UI",
        ],
        { windowsHide: true, maxBuffer: 1024 * 1024 },
        (error, stdout, stderr) => {
          if (error) {
            const detail = String(stderr || stdout || error.message || error).trim();
            reject(new Error(`POS_LABEL_PRINT_FAILED${detail ? `: ${detail}` : ""}`));
            return;
          }
          resolve();
        },
      );
    });
  } finally {
    await fs.promises.unlink(payloadPath).catch(() => undefined);
  }
}

async function startCloudAutoPrint() {
  assertSecureDeviceTransport(API_URL);
  const credentials = await resolvePosDeviceCredentials();

  console.log(`Connecting POS DNS...`);
  console.log(`Target: ${API_URL}/pos`);
  if (STORE_ID) {
    console.log(`Configured store consistency check: ${STORE_ID}`);
  }
  console.log(`POS device: ${credentials.deviceStableId}\n`);

  const socket = io(`${API_URL}/pos`, {
    transports: ["websocket"],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 5000,
    auth: {
      posDeviceId: credentials.deviceStableId,
      posDeviceKey: credentials.deviceKey,
    },
  });

  socket.on("connect", () => {
    console.log(`[Cloud] Connected! Socket ID: ${socket.id}`);
    socket.emit("joinStore", STORE_ID ? { storeId: STORE_ID } : {});
  });

  socket.on("joined", ({ room } = {}) => {
    console.log(`[Cloud] Authorized room joined: ${room || "store room"}`);
  });

  socket.on("connect_error", (error) => {
    console.error(`[Cloud] POS socket connection rejected: ${error.message}`);
  });

  socket.on("disconnect", (reason) => {
    console.warn(`[Cloud] Disconnect: ${reason}`);
  });

  // 核心：监听云端指令
  socket.on("PRINT_JOB", async (job) => {
    const { jobId, target, payload: formattedPayload } = job || {};
    const ack = (success, error) =>
      socket.emit("PRINT_JOB_ACK", {
        jobId,
        target,
        success,
        ...(error ? { error: String(error.message || error) } : {}),
      });
    if (
      !jobId ||
      !["customer", "kitchen", "label"].includes(target) ||
      !formattedPayload
    ) {
      console.error("[Cloud] Invalid PRINT_JOB envelope", job);
      return;
    }
    // 这里的 formattedPayload 已经是后端 PrintPosPayloadService 生成好的完美格式
    // 直接包含 { orderNumber, snapshot: { ... } }

    const orderId = formattedPayload.orderNumber || "Unknown";
    const targetCustomer = target === "customer";
    const targetKitchen = target === "kitchen";
    const targetLabel = target === "label";
    console.log(`[Cloud] 收到打印任务: ${orderId}`);

    try {
      // ==========================================
      // 🖨️ 任务 A: 前台打印机 (Customer Receipt)
      // ==========================================
      if (targetCustomer) {
        const customerBuffer =
          await buildCustomerReceiptEscPos(formattedPayload);
        const frontPrinterName = process.env.POS_FRONT_PRINTER || "POS80";
        if (frontPrinterName) {
          console.log(`Cashier Print -> ${frontPrinterName}`);
          await printEscPosTo(frontPrinterName, customerBuffer);
        } else {
          throw new Error("POS_FRONT_PRINTER_NOT_CONFIGURED");
        }
      }

      // ==========================================
      // 👨‍🍳 任务 B: 后厨打印机 (Kitchen Ticket)
      // ==========================================
      if (targetKitchen) {
        const kitchenBuffer = buildKitchenReceiptEscPos(formattedPayload);
        const kitchenPrinterName = process.env.POS_KITCHEN_PRINTER;
        if (kitchenPrinterName) {
          console.log(`kitchen print -> ${kitchenPrinterName}`);
          await printEscPosTo(kitchenPrinterName, kitchenBuffer);
        } else {
          throw new Error("POS_KITCHEN_PRINTER_NOT_CONFIGURED");
        }
      }

      if (targetLabel) {
        await printLabelPlanWithWindowsDriver(
          orderId,
          formattedPayload.labelPlan,
        );
      }

      console.log(` [Cloud] Print workflow over`);
      ack(true);
    } catch (err) {
      console.error(`[Cloud] Failed print:`, err);
      ack(false, err);
    }
  });

  socket.on("PRINT_SUMMARY", async (summaryData) => {
    console.log(`\n [Cloud] Received print task ”Daily Summary“`);

    try {
      const buffer = buildSummaryReceiptEscPos(summaryData);

      const printerName = process.env.POS_FRONT_PRINTER || "POS80";
      console.log(`Printing ”Daily Summary“ -> ${printerName}`);
      await printEscPosTo(printerName, buffer);

      console.log("Print ”Daily Summary“ completed");
    } catch (err) {
      console.error("Failed print ”Daily Summary“:", err);
    }
  });
}

void startCloudAutoPrint().catch((error) => {
  console.error(`[Cloud] Auto-print disabled: ${error.message}`);
});
