// printer-server.js
// ESC/POS 版本 POS 打印服务（Windows）
//
// - /ping 测试服务是否正常
// - /print-pos 接收 POS 打印请求，生成 ESC/POS 二进制数据
// - 通过 copy /B 把原始数据发到打印机共享

const express = require("express");
const bodyParser = require("body-parser");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { exec } = require("child_process");
const iconv = require("iconv-lite");

// === 打印机配置 ===
// 可以通过环境变量覆盖：POS_FRONT_PRINTER / POS_KITCHEN_PRINTER
// 注意：这里的名字建议用“打印机共享名”，例如 POS80、KITCHEN 等
const FRONT_PRINTER = "POS80";
const KITCHEN_PRINTER = "KC80";

// === ESC/POS 常量 ===
const ESC = 0x1b;
const GS = 0x1d;

// 打印宽度（逻辑宽度，用于对齐和画虚线，不影响纸张本身宽度）
const LINE_WIDTH = 32;

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

// 将 ESC/POS 原始数据发送到指定打印机
function printEscPosTo(printerName, dataBuffer) {
  return new Promise((resolve, reject) => {
    const tmpFile = path.join(
      os.tmpdir(),
      `pos-escpos-${Date.now()}-${Math.random()
        .toString(16)
        .slice(2)}.bin`
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
      // 例如：cmd /C copy /B "C:\Temp\xxx.bin" "\\localhost\POS80"
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
          console.warn(
            "[printEscPosTo] 打印命令 stderr:",
            stderr.toString().trim()
          );
        }

        console.log(
          "[printEscPosTo] 打印命令 stdout:",
          (stdout || "").toString().trim()
        );
        resolve();
      });
    });
  });
}

// ========== ESC/POS 小票内容生成 ==========

// 顾客联
function buildCustomerReceiptEscPos(params) {
  const { orderNumber, pickupCode, fulfillment, paymentMethod, snapshot } =
    params;

const f = String(fulfillment || "").toLowerCase();
const isDelivery = f === "delivery";

const dineZh = isDelivery ? "配送" : f === "pickup" ? "外带" : "堂食";
const dineEn = isDelivery ? "DELIVERY" : f === "pickup" ? "TAKE-OUT" : "DINE-IN";

  const payZh =
    paymentMethod === "cash"
      ? "现金"
      : paymentMethod === "card"
      ? "银行卡"
      : "微信/支付宝";
  const payEn =
    paymentMethod === "cash"
      ? "Cash"
      : paymentMethod === "card"
      ? "Card"
      : "WeChat / Alipay";

  const chunks = [];

  // 初始化打印机
  chunks.push(cmd(ESC, 0x40)); // ESC @

  // ✅ 行距调紧（减少整体留白）
  // n 越小越紧；一般 18~24 比较合适（默认通常更大）
  chunks.push(cmd(ESC, 0x33, 20)); // ESC 3 n

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
  chunks.push(encLine("Qin's Traditional Rougiamo"));
  chunks.push(cmd(GS, 0x21, 0x00)); // 恢复正常大小
  chunks.push(cmd(ESC, 0x45, 0x00)); // 取消加粗
  chunks.push(cmd(ESC, 0x61, 0x00)); // 左对齐
  chunks.push(encLine(makeLine("-")));

  // ==== 订单信息 ====
  // 只打印一行订单号（不再中英文各一行）
  if (orderNumber) {
    chunks.push(encLine(`Order: ${orderNumber}`));
    chunks.push(encLine(""));
  }

  // 用餐方式：保持中英两行
  chunks.push(encLine(`用餐方式: ${dineZh}`));
  chunks.push(encLine(`Dining:   ${dineEn}`));
  chunks.push(encLine(""));

  // 付款方式：保持中英两行
  chunks.push(encLine(`付款方式: ${payZh}`));
  chunks.push(encLine(`Payment:  ${payEn}`));
  chunks.push(encLine(makeLine("-")));

  // ==== 菜品列表（字体调大：名称/选项放大，价格行保持对齐） ====
  if (Array.isArray(snapshot.items)) {
    snapshot.items.forEach((item) => {
      const nameZh = item.nameZh || "";
      const nameEn = item.nameEn || "";

      // ✅ 菜名：加粗 + 双倍高度（0x01 = 高度x2，宽度不变）
      chunks.push(cmd(ESC, 0x45, 0x01)); // bold on
      chunks.push(cmd(GS, 0x21, 0x01));  // double-height only

      if (nameZh) chunks.push(encLine(nameZh));
      if (nameEn) chunks.push(encLine(nameEn));

      // 恢复正常字号（后面价格行要对齐）
      chunks.push(cmd(GS, 0x21, 0x00));
      chunks.push(cmd(ESC, 0x45, 0x00)); // bold off

      // 数量 + 行小计（保持普通字号，便于对齐）
      const qtyPart = `x${item.quantity}`;
      const pricePart = money(item.lineTotalCents ?? 0);

      const qtyPadded = padRight(qtyPart, 8);
      const pricePadded = padLeft(pricePart, LINE_WIDTH - 8);
      chunks.push(encLine(qtyPadded + pricePadded));

      // ✅ 选项（可选）：支持 item.options 为数组 或 optionsText 为字符串
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
        // 选项也放大一点：双倍高度，不加粗
        chunks.push(cmd(GS, 0x21, 0x01));
        optionLines.forEach((opt) => {
          // 缩进 + 标记
          chunks.push(encLine(`  - ${opt}`));
        });
        chunks.push(cmd(GS, 0x21, 0x00));
      }

      // ✅ 每个菜之间只留一行（减少留白）
      chunks.push(encLine(""));
    });
  }

  // ==== 金额汇总（数字只打印一次） ====
  const subtotal = snapshot.subtotalCents ?? 0;
  const discount = snapshot.discountCents ?? 0;
  const tax = snapshot.taxCents ?? 0;
  const total = snapshot.totalCents ?? 0;
  const loyalty = snapshot.loyalty || {};

const deliveryFee = snapshot.deliveryFeeCents ?? 0;

// 允许 cost/subsidy 为 null（比如派单回填尚未完成）
const deliveryCost =
  typeof snapshot.deliveryCostCents === "number" ? snapshot.deliveryCostCents : null;

// subsidy：优先用后端落库值；没有就按 cost-fee 推导
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

  // ==== 底部：谢谢惠顾 + 顾客联 ====
  chunks.push(cmd(ESC, 0x61, 0x01)); // 居中
  chunks.push(encLine("谢谢惠顾"));
  chunks.push(encLine("Thank you!"));
  chunks.push(encLine("顾客联 CUSTOMER COPY"));
  // ✅ 打印时间
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

      // 菜品名：双倍高度 + 加粗
      chunks.push(cmd(ESC, 0x45, 0x01)); // 加粗
      chunks.push(cmd(GS, 0x21, 0x11)); // 双倍高度

      // 为了更贴近你厨房票的风格，把数量一起放在菜名前面
      if (nameZh) {
        chunks.push(encLine(`${qty}  ${nameZh}`));
      }
      if (nameEn) {
        chunks.push(encLine(`${qty}  ${nameEn}`));
      }

      // 恢复正常字号
      chunks.push(cmd(GS, 0x21, 0x00));
      chunks.push(cmd(ESC, 0x45, 0x00));
      chunks.push(encLine("")); // 每个菜之间空一行
    });
  }

  // ==== 底部说明 + 后厨联标记 ====
  chunks.push(encLine(makeLine("-")));
  chunks.push(cmd(ESC, 0x61, 0x01)); // 居中
  chunks.push(encLine("后厨联 KITCHEN COPY"));
  // ✅ 打印时间
  chunks.push(encLine(`打印时间 Print: ${formatPrintTime()}`));
  chunks.push(encLine(""));
  chunks.push(cmd(ESC, 0x61, 0x00)); // 左对齐

  // 切纸
  chunks.push(cmd(GS, 0x56, 0x42, 0x00));

  return Buffer.concat(chunks);
}

// ========== Express 服务 ==========

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

// 主打印接口
app.post("/print-pos", async (req, res) => {
  const payload = req.body;
  const {
    locale,
    orderNumber,
    pickupCode,
    fulfillment,
    paymentMethod,
    snapshot,
    targets,
  } = payload || {};

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
    return res
      .status(400)
      .json({ error: "Missing snapshot.items in payload" });
  }

  try {
    const customerData = buildCustomerReceiptEscPos({
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
  console.log(
    `POS ESC/POS printer server listening on http://127.0.0.1:${PORT}`
  );
  console.log(
    "Front printer logical name:",
    FRONT_PRINTER || "(system default)"
  );
  console.log(
    "Kitchen printer logical name:",
    KITCHEN_PRINTER || "(same as front)"
  );
});
