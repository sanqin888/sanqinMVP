import {
  StaffFeedback,
  StaffPage,
  StaffPageHeader,
  StaffPanel,
  StaffSection,
} from '@/components/staff/StaffPrimitives';

export default async function AdminBrandPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const isZh = locale === 'zh';

  return (
    <StaffPage>
      <StaffPageHeader
        eyebrow={isZh ? '品牌管理' : 'Brand management'}
        title={isZh ? '品牌配置' : 'Brand configuration'}
        description={
          isZh
            ? '这里预留 BrandConfig 的品牌级配置入口。等 Brand/Store writer boundary 完成后，再接入真实读写表单。'
            : 'This workspace is reserved for BrandConfig-owned brand settings. Real read/write forms will be connected after the Brand/Store writer boundary is complete.'
        }
      />

      <StaffFeedback tone="warning">
        {isZh
          ? '当前仅建立 UI 结构，不在这一轮接入旧 BusinessConfig writer。积分、等级、推荐奖励等 Benefits policy 虽然仍暂存于 BrandConfig 表中，但不属于品牌管理 UI。'
          : 'This phase establishes UI structure only and does not connect the legacy BusinessConfig writer. Benefits policy fields may still be stored in BrandConfig temporarily, but they do not belong to Brand management UI.'}
      </StaffFeedback>

      <StaffSection
        title={isZh ? '品牌基础信息' : 'Brand basics'}
        description="brandNameZh · brandNameEn · siteUrl"
      >
        <StaffPanel id="brand-basics" className="p-5 text-sm text-slate-500">
          {isZh ? '品牌名称与官方网站配置将在后续 Brand writer 切换时接入。' : 'Brand names and website settings will be connected during the Brand writer cutover.'}
        </StaffPanel>
      </StaffSection>

      <StaffSection
        title={isZh ? '消息发送身份' : 'Sender identity'}
        description="emailFromNameZh · emailFromNameEn · emailFromAddress · smsSignature"
      >
        <StaffPanel id="sender-identity" className="p-5 text-sm text-slate-500">
          {isZh ? '邮件发件名称、发件地址与短信签名将在 Messaging writer 边界稳定后接入。' : 'Email sender names, sender address, and SMS signature will be connected after the Messaging writer boundary is stable.'}
        </StaffPanel>
      </StaffSection>

      <StaffSection
        title={isZh ? '客服联系方式' : 'Support contacts'}
        description="supportPhone · supportEmail"
      >
        <StaffPanel id="support-contacts" className="p-5 text-sm text-slate-500">
          {isZh ? '品牌客服电话与客服邮箱将在 Brand writer 切换后接入。' : 'Brand support phone and email will be connected after the Brand writer cutover.'}
        </StaffPanel>
      </StaffSection>

      <StaffSection
        title={isZh ? '支付与汇率' : 'Payments & exchange rate'}
        description="wechatAlipayExchangeRate"
      >
        <StaffPanel id="exchange-rate" className="p-5 text-sm text-slate-500">
          {isZh ? '微信/支付宝人工汇率配置将在 Brand writer 切换后接入。' : 'The manual WeChat/Alipay exchange rate setting will be connected after the Brand writer cutover.'}
        </StaffPanel>
      </StaffSection>
    </StaffPage>
  );
}
