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
const { Jimp } = require("jimp");
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

function getOptionLines(item, { includeEnglish = false, includePrice = true } = {}) {
  if (!item || typeof item !== "object") return [];
  if (!Array.isArray(item.options)) return [];

  return item.options.flatMap((group) => {
    if (!group || typeof group !== "object") return [];

    const choices = Array.isArray(group.choices) ? group.choices : [];
    return choices
      .map((choice) => {
        if (!choice || typeof choice !== "object") return "";
        const nameZh =
          typeof choice.nameZh === "string" ? choice.nameZh.trim() : "";
        const nameEn =
          typeof choice.nameEn === "string" ? choice.nameEn.trim() : "";
        const priceDeltaCents =
          typeof choice.priceDeltaCents === "number" && Number.isFinite(choice.priceDeltaCents)
            ? Math.round(choice.priceDeltaCents)
            : 0;

        const priceSuffix =
          includePrice && priceDeltaCents !== 0
            ? ` (${priceDeltaCents > 0 ? "+" : "-"}${money(Math.abs(priceDeltaCents))})`
            : "";

        if (includeEnglish && nameZh && nameEn) return `${nameZh} ${nameEn}${priceSuffix}`;
        if (nameZh) return `${nameZh}${priceSuffix}`;
        if (includeEnglish && nameEn) return `${nameEn}${priceSuffix}`;

        if (!includeEnglish) return "";

        const displayName =
          typeof choice.displayName === "string" ? choice.displayName.trim() : "";
        if (!displayName) return "";
        return `${displayName}${priceSuffix}`;
      })
      .filter(Boolean);
  });
}

// PNG/JPG -> ESC/POS Raster Bit Image (GS v 0)
async function escposRasterFromImage(filePath, targetWidthDots = LOGO_WIDTH_DOTS) {
  try {
    // 1. 读取图片
    const img = await Jimp.read(filePath);

    // 2. ⚠️【核心修复】计算高度并使用对象传参 (适配 Jimp v1.6.0+)
    // 旧版: img.resize(w, -1) 
    // 新版: img.resize({ w: w }) 或者需要显式计算高度
    const srcW = img.width;   // v1 直接用属性，不再是 bitmap.width
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
          if (v < threshold) b |= (0x80 >> bit);
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
          console.warn("[printEscPosTo] Print command stderr:", stderr.toString().trim());
        }

        console.log("[printEscPosTo] Print command stdout:", (stdout || "").toString().trim());
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

  // ✅ 行距调紧（减少整体留白）
  chunks.push(cmd(ESC, 0x33, 42));

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
      const optionLines = getOptionLines(item, { includeEnglish: true });

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
  const cashReceivedCents = Number.isFinite(params.cashReceivedCents)
    ? Math.max(0, Math.round(params.cashReceivedCents))
    : 0;
  const cashChangeCents = Number.isFinite(params.cashChangeCents)
    ? Math.max(0, Math.round(params.cashChangeCents))
    : 0;
  const creditCardSurcharge = snapshot.creditCardSurchargeCents ?? 0;
  const loyalty = snapshot.loyalty || {};

  const deliveryFee = snapshot.deliveryFeeCents ?? 0;

  chunks.push(encLine(makeLine("-")));
  chunks.push(encLine(`小计 Subtotal: ${money(subtotal)}`));
  if (discount > 0) {
    chunks.push(encLine(`折扣 Discount: -${money(discount)}`));
  }
  if (typeof loyalty.pointsRedeemed === "number" && loyalty.pointsRedeemed > 0) {
    chunks.push(encLine(`积分抵扣 Points: -${loyalty.pointsRedeemed.toFixed(2)} pt`));
  }

  if (isDelivery || deliveryFee > 0) {
    chunks.push(encLine(`配送费(顾客) Delivery Fee: ${money(deliveryFee)}`));
  }

  if (creditCardSurcharge > 0) {
    chunks.push(encLine(`信用卡附加费 Card Surcharge: ${money(creditCardSurcharge)}`));
  }

  chunks.push(encLine(`税费(HST) Tax: ${money(tax)}`));
  chunks.push(encLine(`合计 Total:   ${money(total)}`));
  if (cashReceivedCents > 0) {
    chunks.push(encLine(`实收 Paid:    ${money(cashReceivedCents)}`));
  }
  if (cashChangeCents > 0) {
    chunks.push(encLine(`找零 Change:  ${money(cashChangeCents)}`));
  }

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
      const qty = item.quantity ?? 0;

      chunks.push(cmd(ESC, 0x45, 0x01)); // 加粗
      chunks.push(cmd(GS, 0x21, 0x11)); // 双倍高度

      if (nameZh) {
        chunks.push(encLine(`${qty}  ${nameZh}`));
      }

      chunks.push(cmd(GS, 0x21, 0x00));
      chunks.push(cmd(ESC, 0x45, 0x00));

      const optionLines = getOptionLines(item, {
        includeEnglish: false,
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

  const resolvedBreakdownType = breakdownType === "payment" ? "payment" : "channel";
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
          : "按渠道汇总 (By Channel)"
      )
    );
    chunks.push(cmd(ESC, 0x45, 0x00));
    chunks.push(encLine("(金额: 实际收款 - 不含税)"));
    chunks.push(encLine(""));

    chunks.push(encLine(padRight("类别", 14) + padLeft("单数", 6) + padLeft("金额", 12)));
    chunks.push(encLine(makeLine(".")));

    resolvedBreakdownItems.forEach((item) => {
      let label = item.label || item.payment || item.channel || item.fulfillmentType || "Unknown";
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
app.listen(19191, () => console.log("Local server is running, this is for health check."));

// ============================================================
// 🚀 云端自动接单模块 (Cloud Auto-Print)
// ============================================================

const API_URL = process.env.API_URL || 'http://localhost:3000';
const STORE_ID = process.env.STORE_ID;

if (STORE_ID) {
  console.log(`Connecting POS DNS...`);
  console.log(`Target: ${API_URL}/pos`);
  console.log(`Store: ${STORE_ID}\n`);

  const socket = io(`${API_URL}/pos`, {
    transports: ['websocket'],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 5000,
  });

  socket.on('connect', () => {
    console.log(`[Cloud] Connected! Socket ID: ${socket.id}`);
    socket.emit('joinStore', { storeId: STORE_ID });
  });

  socket.on('Disconnect', (reason) => {
    console.warn(`[Cloud] Disconnect: ${reason}`);
  });

  // 核心：监听云端指令
  socket.on('PRINT_JOB', async (formattedPayload) => {
    // 这里的 formattedPayload 已经是后端 PrintPosPayloadService 生成好的完美格式
    // 直接包含 { orderNumber, snapshot: { ... } }

    const orderId = formattedPayload.orderNumber || 'Unknown';
    const targetCustomer = formattedPayload?.targets?.customer ?? true;
    const targetKitchen = formattedPayload?.targets?.kitchen ?? true;
    console.log(`[Cloud] 收到打印任务: ${orderId}`);

    try {
      // ==========================================
      // 🖨️ 任务 A: 前台打印机 (Customer Receipt)
      // ==========================================
      if (targetCustomer) {
        const customerBuffer = await buildCustomerReceiptEscPos(formattedPayload);
        const frontPrinterName = process.env.POS_FRONT_PRINTER || "POS80";
        if (frontPrinterName) {
          console.log(`Cashier Print -> ${frontPrinterName}`);
          await printEscPosTo(frontPrinterName, customerBuffer);
        } else {
          console.warn(`No cashier printer found (POS_FRONT_PRINTER)`);
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
          console.log(`No kitchen printer found (POS_KITCHEN_PRINTER)，pass。`);
        }
      }

      console.log(` [Cloud] Print workflow over`);
    } catch (err) {
      console.error(`[Cloud] Failed print:`, err);
    }
  });


  socket.on('PRINT_SUMMARY', async (summaryData) => {
    console.log(`\n [Cloud] Received print task ”Daily Summary“`);

    try {
      const buffer = buildSummaryReceiptEscPos(summaryData);

      const printerName = process.env.POS_FRONT_PRINTER || "POS80";
      console.log(`Printing ”Daily Summary“ -> ${printerName}`);
      await printEscPosTo(printerName, buffer);

      console.log('Print ”Daily Summary“ completed');
    } catch (err) {
      console.error('Failed print ”Daily Summary“:', err);
    }
  });

} else {
  console.warn(`[Cloud] No STORE_ID Found，cloud print server stop。`);
}
