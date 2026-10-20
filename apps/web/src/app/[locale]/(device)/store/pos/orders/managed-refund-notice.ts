import type { ManagedCardRefundResult } from "@/lib/api/pos";
import type { Locale } from "@/lib/i18n/locales";

type RefundNotice = { message: string; tone: "success" | "error" };
type RefundObservation = Pick<
  ManagedCardRefundResult<unknown>,
  "status" | "operation" | "reversalOutcome" | "failureCode" | "failureMessage"
>;

export function managedRefundUncertainNotice(locale: Locale): RefundNotice {
  return {
    tone: "error",
    message:
      locale === "zh"
        ? "撤销/退款结果尚未确认，请核验原交易；勿重复撤销、退款或改用其他退款方式。"
        : "Void/refund result is unconfirmed. Review the original transaction; do not submit another void/refund or use another refund method.",
  };
}

export function managedRefundNotice(
  result: RefundObservation,
  locale: Locale,
): RefundNotice {
  const zh = locale === "zh";
  if (result.status === "SUCCEEDED") {
    let message: string;
    if (result.reversalOutcome === "VOIDED") {
      message = zh ? "撤销已确认。" : "Void confirmed.";
    } else if (
      result.reversalOutcome === "REFUNDED" &&
      result.operation === "VOID"
    ) {
      message = zh
        ? "退款已确认（原请求为撤销，支付平台实际执行了退款）。"
        : "Refund confirmed (the payment provider converted the void request into a refund).";
    } else if (result.operation === "VOID") {
      // An older API may omit the additive outcome field. Never guess a void
      // from the requested operation alone.
      message = zh
        ? "款项退回已确认，具体为撤销或退款请核验原交易。"
        : "Payment reversal confirmed. Review the original transaction for the void/refund type.";
    } else {
      message = zh ? "退款已确认。" : "Refund confirmed.";
    }
    return { tone: "success", message };
  }
  if (result.failureCode === "POS_MANAGED_CARD_REFUND_REQUIRES_CARD") {
    return {
      tone: "error",
      message: zh
        ? "这笔订单必须原路退回银行卡，请选择银行卡。"
        : "This order must be returned to the original card. Select Card.",
    };
  }
  if (
    result.status === "FAILED" ||
    result.status === "DECLINED" ||
    result.status === "CANCELLED"
  ) {
    const detail = result.failureMessage?.trim();
    const guidance = zh
      ? "本次撤销/退款未完成，请核验原交易后再处理；勿直接重复提交。"
      : "This void/refund did not complete. Review the original transaction before any further action; do not resubmit blindly.";
    return {
      tone: "error",
      message: detail ? `${detail} ${guidance}` : guidance,
    };
  }
  return managedRefundUncertainNotice(locale);
}
