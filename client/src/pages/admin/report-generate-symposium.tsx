import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { errorToast, successToast } from '@/lib/toast';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { BarChart3 } from 'lucide-react';
import { ReportGenerateShell } from '@/components/reports/ReportGenerateShell';

export default function ReportGenerateSymposiumPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);

  const generateReportMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest('POST', '/api/reports/generate/symposium', {});
    },
    onSuccess: () => {
            successToast(
        toast,
        'Report Generated',
        'Symposium-wide report has been generated successfully',
      );
      queryClient.invalidateQueries({ queryKey: ['/api/reports'] });
      setLocation('/admin/reports');
    },
    onError: (error: Error) => {
            errorToast(
        toast,
        'Generation Failed',
        error.message || 'Failed to generate report',
      );
    },
  });

  const handleGenerateClick = () => {
    setShowConfirmDialog(true);
  };

  const handleConfirmGenerate = () => {
    setShowConfirmDialog(false);
    generateReportMutation.mutate();
  };

  return (
    <>
      <ReportGenerateShell
        title="Generate Symposium Report"
        subtitle="Create a comprehensive report aggregating data from all events in the symposium"
        cardTitle="Symposium-wide Report"
        cardIcon={<BarChart3 className="h-5 w-5" />}
        cardDescription="Generate an aggregate report containing overall statistics, event summaries, top performers, and completion rates across all events"
        contents={[
          'Overview of all events and their status',
          'Total participants and event admins',
          'Event summaries with completion rates',
          'Top 20 performers across all events',
          'Aggregate violation statistics',
          'Cross-event analytics and trends',
        ]}
        note={
          <>
            This report will aggregate data from <strong>all events</strong> in the system.
            Generation may take a few moments depending on the amount of data.
          </>
        }
        generateLabel="Generate Symposium Report"
        isPending={generateReportMutation.isPending}
        onGenerate={handleGenerateClick}
        headingTestId="heading-generate-symposium-report"
      />

      <AlertDialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <AlertDialogContent data-testid="dialog-confirm">
          <AlertDialogHeader>
            <AlertDialogTitle>Generate Symposium Report?</AlertDialogTitle>
            <AlertDialogDescription>
              This will create a comprehensive report aggregating data from all events in the system.
              This operation may take a few moments to complete.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-dialog-cancel">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmGenerate} data-testid="button-dialog-confirm">
              Generate Report
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
