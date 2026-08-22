// apps/web/src/app/[locale]/legal/allergen/page.tsx

import type { Metadata } from "next";
import { isLocale } from "@/lib/i18n/locales";
import type { Locale } from "@/lib/i18n/locales";
import { notFound } from "next/navigation";

export async function generateMetadata({
  params,
}: {
  params: { locale: string };
}): Promise<Metadata> {
  const { locale } = params;
  if (!isLocale(locale)) return {};
  const isZh = locale === "zh";

  return {
    title: isZh ? "三秦 · 过敏原与食材说明" : "San Qin · Allergen Information",
  };
}

export default function AllergenPage({
  params,
}: {
  params: { locale: Locale };
}) {
  const { locale } = params;
  if (!isLocale(locale)) notFound();
  const isZh = locale === "zh";

  return (
    <div className="space-y-6 text-sm text-slate-800">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold text-slate-900">
          {isZh ? "过敏原与食材说明" : "Allergen & ingredient information"}
        </h1>
        <p className="text-xs text-slate-500">
          {isZh
            ? "生效及最后更新日期：2026-08-22。本说明适用于 SANQIN RESTAURANT 运营的 SanQ Roujiamo（三秦肉夹馍）。配方、供应商品牌和原材料可能发生变化；如你有严重食物过敏、乳糜泻或其他需要严格避免特定成分的情况，请在下单前直接联系我们。"
            : "Effective and last updated: 2026-08-22. This notice applies to SanQ Roujiamo operated by SANQIN RESTAURANT. Recipes, supplier brands, and ingredients may change. If you have a severe food allergy, celiac disease, or another condition requiring strict ingredient avoidance, please contact us before ordering."}
        </p>
      </header>

      <section className="space-y-2">
        <h2 className="text-base font-semibold">
          {isZh ? "1. 当前厨房相关过敏原" : "1. Allergens relevant to our kitchen"}
        </h2>
        <p>
          {isZh
            ? "根据当前菜品、选项和厨房原料，我们的餐品可能含有或接触到：小麦（及含麸质谷物）、花生、坚果类、芝麻、鸡蛋、牛奶/乳制品、大豆、亚硫酸盐，以及甲壳类（例如虾）。"
            : "Based on our current menu, options, and kitchen ingredients, our food may contain or come into contact with wheat (and gluten-containing grains), peanuts, tree nuts, sesame, eggs, milk/dairy, soy, sulphites, and crustaceans such as shrimp."}
        </p>
        <p className="text-xs text-slate-500">
          {isZh
            ? "小麦过敏与麸质不耐受/乳糜泻并不是同一种情况。即使某道菜的主要配方中没有明显小麦成分，共用设备、调味料或供应商原料也可能造成接触风险。"
            : "Wheat allergy is not the same as gluten intolerance or celiac disease. Even when wheat is not an obvious main ingredient, shared equipment, seasonings, or supplier ingredients may create exposure risk."}
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold">
          {isZh ? "2. 配方变化与交叉接触" : "2. Recipe changes & cross-contact"}
        </h2>
        <p>
          {isZh
            ? "厨房会共用工作台、炊具、油炸/烹饪设备、储存空间或其他操作区域。我们会采取合理的清洁和操作措施，但无法保证任何餐品完全不含某种过敏原，也无法保证不存在交叉接触。"
            : "Our kitchen shares work surfaces, cookware, frying/cooking equipment, storage space, and other preparation areas. We take reasonable cleaning and handling measures, but we cannot guarantee that any food is completely free of a particular allergen or that cross-contact will not occur."}
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold">
          {isZh ? "3. 订单备注与特殊要求" : "3. Order notes & special requests"}
        </h2>
        <p>
          {isZh
            ? "你可以使用订单或菜品备注说明口味、忌口或过敏相关信息。我们会在实际操作允许的范围内查看并尽力配合，但备注、删除某项配料或员工确认均不构成“无过敏原”保证。对于我们无法合理安全处理的严重过敏要求，我们可能建议不要订购相关餐品。"
            : "You may use order or item notes to describe taste preferences, dietary restrictions, or allergy-related information. We will review and accommodate requests where operationally possible, but a note, removal of an ingredient, or staff confirmation does not constitute an allergen-free guarantee. For severe allergy requests that we cannot reasonably handle safely, we may recommend that you do not order the affected food."}
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold">
          {isZh ? "4. 严重过敏、乳糜泻与食物不耐受" : "4. Severe allergy, celiac disease & intolerance"}
        </h2>
        <p>
          {isZh
            ? "如你或同餐者可能因少量接触某种成分而发生严重反应，或需要严格避免麸质等成分，请不要仅依赖网站菜单名称、备注栏或一般过敏原列表作出决定。下单前请直接联系我们说明具体过敏原和严重程度；如仍无法确认是否适合食用，应避免订购相关餐品并咨询合格的医疗专业人士。"
            : "If you or someone in your party may have a severe reaction from small amounts of an ingredient, or must strictly avoid gluten or another substance, do not rely only on menu names, order notes, or this general allergen list. Contact us before ordering with the specific allergen and severity. If suitability still cannot be confirmed, avoid ordering the affected food and consult a qualified health professional where appropriate."}
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold">
          {isZh ? "5. 信息范围" : "5. Scope of this information"}
        </h2>
        <p className="text-xs text-slate-500">
          {isZh
            ? "本页面用于帮助顾客了解当前厨房的主要过敏原和交叉接触风险，不构成医疗或营养建议。若供应商原料、菜单或配方发生变化，我们会在合理情况下更新本说明；如某项信息对你的安全至关重要，请在每次下单前重新确认。"
            : "This page is intended to help customers understand the main allergen and cross-contact risks in our current kitchen and is not medical or nutritional advice. We will reasonably update this notice when supplier ingredients, menu items, or recipes change. If a particular detail is critical to your safety, confirm it again before each order."}
        </p>
      </section>
    </div>
  );
}
