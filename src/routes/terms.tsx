import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { settingsQuery } from "@/lib/directory";
import { FileText, CheckCircle2 } from "lucide-react";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "شروط الاستخدام — أهل الصنعة" },
      { name: "description", content: "شروط وأحكام استخدام منصة أهل الصنعة للحرفيين والباحثين عن الخدمات." },
      { property: "og:title", content: "شروط الاستخدام — أهل الصنعة" },
      { property: "og:description", content: "شروط وضوابط استخدام دليل وخدمات أهل الصنعة." },
    ],
  }),
  component: TermsPage,
});

function TermsPage() {
  const { data: settings } = useQuery(settingsQuery);
  const appName = settings?.["app_name"] || "أهل الصنعة";
  const customTerms = settings?.["terms_content"]?.trim();

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col justify-between">
      <div>
        <SiteHeader />
        <main className="mx-auto w-full max-w-3xl px-4 py-8">
          <section className="space-y-6">
            <div className="border-b border-border pb-5">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary mb-3">
                <FileText className="size-3.5" /> الضوابط والأحكام
              </span>
              <h1 className="text-2xl font-extrabold sm:text-3xl text-foreground">
                شروط الاستخدام
              </h1>
              <p className="mt-2 text-base text-muted-foreground leading-relaxed">
                {customTerms
                  ? `باستخدامك لمنصة «${appName}»، فإنك توافق على الالتزام بالشروط والضوابط الموضحة أدناه.`
                  : `باستخدامك لمنصة «${appName}»، فإنك توافق على الالتزام بالشروط والضوابط الموضحة أدناه والتي تنظم استخدام الدليل والتواصل مع مقدمي الخدمات.`}
              </p>
            </div>

            {customTerms ? (
              <div className="surface p-6 sm:p-8 space-y-4">
                <div className="whitespace-pre-wrap leading-relaxed text-sm sm:text-base text-foreground/90 font-medium">
                  {customTerms}
                </div>
              </div>
            ) : (
              <>
                <div className="surface p-5 space-y-3">
                  <h2 className="text-lg font-bold flex items-center gap-2">
                    <CheckCircle2 className="size-5 text-primary" />
                    1. الغرض من الخدمة
                  </h2>
                  <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                    منصة «{appName}» هي دليل إلكتروني يهدف لتيسير التواصل بين أصحاب المهن الحرفية والخدمية وبين الراغبين في الاستفادة من خدماتهم داخل النطاق الجغرافي المحدد. المنصة وسيط إعلامي ومعلوماتي فقط ولا تتدخل في إدارة الأعمال أو تسعير الخدمات.
                  </p>
                </div>

                <div className="surface p-5 space-y-3">
                  <h2 className="text-lg font-bold flex items-center gap-2">
                    <CheckCircle2 className="size-5 text-primary" />
                    2. التزامات مقدمي الخدمات
                  </h2>
                  <ul className="list-disc list-inside space-y-2 text-xs sm:text-sm text-muted-foreground leading-relaxed pr-2">
                    <li>تقديم بيانات صحيحة ومحدثة بخصوص أرقام الهواتف ومجال العمل والنطاق الجغرافي.</li>
                    <li>احترام مواعيد وأصول العمل والتعامل بأمانة ومهنية مع العملاء.</li>
                    <li>إخطار إدارة المنصة في حال الرغبة في التوقف عن العمل أو تعديل وسائل التواصل.</li>
                  </ul>
                </div>

                <div className="surface p-5 space-y-3">
                  <h2 className="text-lg font-bold flex items-center gap-2">
                    <CheckCircle2 className="size-5 text-primary" />
                    3. حدود المسؤولية والنزاعات
                  </h2>
                  <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                    الاتفاق المالي ومواصفات الخدمة وجودة التنفيذ تقع مسؤوليتها كاملة بين طالب الخدمة ومقدمها. لا تتحمل المنصة أو إدارتها أي مسؤولية مدنية أو قانونية أو مالية ناتجة عن أي خلاف مهني أو تقصير أو تلفيات قد تحدث أثناء تأدية الخدمة.
                  </p>
                </div>

                <div className="surface p-5 space-y-3">
                  <h2 className="text-lg font-bold flex items-center gap-2">
                    <CheckCircle2 className="size-5 text-primary" />
                    4. سياسة التقييمات والمراجعات
                  </h2>
                  <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                    التقييمات تخضع لمراجعة إدارة المنصة لضمان عدم احتوائها على أي ألفاظ غير لائقة أو تشهير أو مراجعات كيدية غير حقيقية، وتحتفظ إدارة المنصة بحق حجب أو تعديل أي مراجعة تخالف الآداب العامة.
                  </p>
                </div>
              </>
            )}
          </section>
        </main>
      </div>

      <SiteFooter />
    </div>
  );
}
