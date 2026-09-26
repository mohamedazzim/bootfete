import type { ReactNode } from 'react';
import { useLocation } from 'wouter';
import AdminLayout from '@/components/layouts/AdminLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { FileText, Loader2 } from 'lucide-react';

/**
 * Shared shell for the two report-generation pages (event + symposium).
 * Both pages are: header → max-w-2xl card → contents box → optional note →
 * generate/cancel buttons → redirect back to /admin/reports. The only
 * per-type differences are the picker (event select) and the confirm dialog.
 */
export function ReportGenerateShell({
  title,
  subtitle,
  cardTitle,
  cardIcon,
  cardDescription,
  contents,
  note,
  children,
  generateLabel,
  isPending,
  onGenerate,
  headingTestId,
}: {
  title: string;
  subtitle: string;
  cardTitle: string;
  cardIcon?: ReactNode;
  cardDescription: string;
  contents: string[];
  note?: ReactNode;
  children?: ReactNode;
  generateLabel: string;
  isPending: boolean;
  onGenerate: () => void;
  headingTestId: string;
}) {
  const [, setLocation] = useLocation();

  return (
    <AdminLayout>
      <div className="p-4 md:p-8">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900" data-testid={headingTestId}>
            {title}
          </h1>
          <p className="text-gray-600 mt-1">{subtitle}</p>
        </div>

        <Card className="max-w-2xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {cardIcon ?? <FileText className="h-5 w-5" />}
              {cardTitle}
            </CardTitle>
            <CardDescription>{cardDescription}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {children}

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h4 className="font-medium text-blue-900 mb-2">Report Contents</h4>
              <ul className="text-sm text-blue-800 space-y-1">
                {contents.map((item) => (
                  <li key={item}>• {item}</li>
                ))}
              </ul>
            </div>

            {note && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                <h4 className="font-medium text-amber-900 mb-2">Note</h4>
                <div className="text-sm text-amber-800">{note}</div>
              </div>
            )}

            <div className="flex gap-3">
              <Button
                onClick={onGenerate}
                disabled={isPending}
                className="flex-1"
                data-testid="button-generate"
              >
                {isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Generating Report...
                  </>
                ) : (
                  <>
                    <FileText className="mr-2 h-4 w-4" />
                    {generateLabel}
                  </>
                )}
              </Button>
              <Button
                variant="outline"
                onClick={() => setLocation('/admin/reports')}
                disabled={isPending}
                data-testid="button-cancel"
              >
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
