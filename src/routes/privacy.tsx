import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { settingsQuery } from "@/lib/directory";
import { Shield, Eye, Phone, Database, MessageSquareWarning } from "lucide-react";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "سياسة الخصوصية — أهل الصنعة" },
      { name: "description", content: "تعرف على سياسة الخصوصية وحماية البيانات في منصة أهل الصنعة وكيفية التعامل مع أرقام الهواتف والتقييمات." },
      { property: "og:title", content: "سياسة الخصوصية — أهل الصنعة" },
      { property: "og:description", content: "شفافية كاملة حول جمع واستخدام البيانات في منصة أهل الصنعة." },
    ],
  }),
  component: PrivacyPage,
});

function PrivacyPage() {
  const { data: settings } = useQuery(settingsQuery);
  const appName = settings?.["app_name"] || "أهل الصنعة";
  const customPrivacy = settings?.["privacy_content"]?.trim();

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col justify-between">
      <div>
        <SiteHeader />
        <main className="mx-auto w-full max-w-3xl px-4 py-8">
          <section className="space-y-6">
            <div className="border-b border-border pb-5">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary mb-3">
                <Shield className="size-3.5" /> الخصوصية وحماية البيانات
              </span>
              <h1 className="text-2xl font-extrabold sm:text-3xl text-foreground">
                سياسة الخصوصية
              </h1>
              <p className="mt-2 text-base text-muted-foreground leading-relaxed">
                {customPrivacy
                  ? `نلتزم في منصة «${appName}» بالشفافية الكاملة وحماية خصوصية الزوار ومقدمي الخدمات.`
                  : `نلتزم في منصة «${appName}» بالشفافية الكاملة وحماية خصوصية الزوار ومقدمي الخدمات. توضح هذه السياسة طبيعة البيانات المجمعة وكيفية استخدامها بدقة طبقاً للوظائف الفعلية للمنصة.`}
              </p>
            </div>

            {customPrivacy ? (
              <div className="surface p-6 sm:p-8 space-y-4">
                <div className="whitespace-pre-wrap leading-relaxed text-sm sm:text-base text-foreground/90 font-medium">
                  {customPrivacy}
                </div>
              </div>
            ) : (
              <>
                {/* 1. البيانات التي يتم جمعها */}
                <div className="surface p-5 space-y-4">
                  <h2 className="text-lg font-bold flex items-center gap-2">
                    <Database className="size-5 text-primary" />
                    1. البيانات التي يتم جمعها
                  </h2>
                  <div className="space-y-3 text-sm text-muted-foreground leading-relaxed">
                    <p>نجمع فقط البيانات الضرورية لتشغيل الدليل وتسهيل الخدمة:</p>
                    <ul className="list-disc list-inside space-y-2 pr-2 text-xs sm:text-sm">
                      <li>
                        <strong className="text-foreground">بيانات التفاعل والإحصائيات (Analytics):</strong> يتم تسجيل ضغطات الاتصال وضغطات تطبيق واتساب وزيارات ملفات الصنايعية وكلمات البحث لحساب مدى التفاعل وترتيب الخدمات الأكثر طلباً. هذه العمليات لا تتضمن أي تتبع خارجي أو مشاركة مع شبكات إعلانية.
                      </li>
                      <li>
                        <strong className="text-foreground">التقييمات والمراجعات (Reviews):</strong> عند كتابة تقييم لصنايعي، نجمع (الاسم، نص التقييم، التقييم بالنجوم، ورقم هاتف المستخدم للتأكد من جدية التجربة ولمنع المراجعات الوهمية والمكررة).
                      </li>
                      <li>
                        <strong className="text-foreground">طلبات ترشيح وإضافة الصنايعية (Applications):</strong> نجمع (اسم الصنايعي، رقم هاتفه، رقم الواتساب، التخصص المهني، والقرية أو المنطقة التابع لها) لمراجعة الطلب واعتماده في الدليل.
                      </li>
                      <li>
                        <strong className="text-foreground">بلاغات المشاكل واقتراح الخدمات:</strong> عند إرسال بلاغ عن رقم غير صحيح أو اقتراح صنعة جديدة، يتم جمع تفاصيل البلاغ لتحسين بيانات الدليل.
                      </li>
                    </ul>
                  </div>
                </div>

                {/* 2. حماية أرقام الهواتف والتواصل */}
                <div className="surface p-5 space-y-3">
                  <h2 className="text-lg font-bold flex items-center gap-2">
                    <Phone className="size-5 text-primary" />
                    2. حماية أرقام الهواتف والتواصل
                  </h2>
                  <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                    لا تظهر أرقام هواتف الصنايعية في الواجهة العامة للزواحف ومحركات البحث بشكل مباشر، بل يتم توفيرها عبر آليات تواصل تفاعلية واضحة (الاتصال المباشر أو المحادثة عبر واتساب) لمنع جمع الأرقام آلياً أو استخدامها في رسائل دعائية غير مرغوب فيها.
                  </p>
                </div>

                {/* 3. مشاركة البيانات مع أطراف ثالثة */}
                <div className="surface p-5 space-y-3">
                  <h2 className="text-lg font-bold flex items-center gap-2">
                    <Eye className="size-5 text-primary" />
                    3. عدم مشاركة أو بيع البيانات
                  </h2>
                  <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                    لا نقوم ببيع أو تأجير أو مشاركة أي بيانات شخصية أو أرقام هواتف مع أي جهات تسويقية أو شركات تجارية. كافة البيانات مخصصة حصراً لخدمة دليل المنطقة.
                  </p>
                </div>

                {/* 4. آلية حذف البيانات والتواصل */}
                <div className="surface p-5 space-y-3">
                  <h2 className="text-lg font-bold flex items-center gap-2">
                    <MessageSquareWarning className="size-5 text-primary" />
                    4. آلية تعديل أو حذف البيانات والتواصل
                  </h2>
                  <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                    يحق لأي حرفي أو صاحب مهنة مسجل في الدليل طلب تحديث بياناته أو حذف ملفه بشكل كامل من المنصة في أي وقت. يمكنك إجراء ذلك بسهولة من خلال:
                  </p>
                  <ul className="list-disc list-inside space-y-1.5 pr-2 text-xs sm:text-sm text-muted-foreground">
                    <li>الضغط على خيار <strong className="text-foreground">«الإبلاغ عن مشكلة»</strong> الموجود أسفل صفحة الصنايعي في المنصة واختيار سبب الطلب.</li>
                    <li>مراجعة إدارة المنصة لطلب حذف السجل أو تعديل رقم الهاتف فوراً.</li>
                  </ul>
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
