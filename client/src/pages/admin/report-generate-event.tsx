import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { errorToast, successToast } from '@/lib/toast';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { ReportGenerateShell } from '@/components/reports/ReportGenerateShell';
import { statusLabel } from '@/components/StatusBadge';
import type { Event } from '@shared/schema';

export default function ReportGenerateEventPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [selectedEventId, setSelectedEventId] = useState<string>('');

  const { data: events, isLoading: eventsLoading } = useQuery<Event[]>({
    queryKey: ['/api/events'],
  });

  const generateReportMutation = useMutation({
    mutationFn: async (eventId: string) => {
      return await apiRequest('POST', '/api/reports/generate/event', { eventId });
    },
    onSuccess: () => {
            successToast(
        toast,
        'Report Generated',
        'Event report has been generated successfully',
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

  const handleGenerate = () => {
    if (!selectedEventId) {
            errorToast(
        toast,
        'Event Required',
        'Please select an event to generate a report',
      );
      return;
    }
    generateReportMutation.mutate(selectedEventId);
  };

  return (
    <ReportGenerateShell
      title="Generate Event Report"
      subtitle="Create a comprehensive report for a specific event including participant data, scores, and violations"
      cardTitle="Event Selection"
      cardDescription="Select an event to generate a detailed report with all rounds, questions, participant scores, and violation logs"
      contents={[
        'Event details and configuration',
        'Round-by-round analysis with questions',
        'Participant scores and rankings',
        'Violation logs and proctoring data',
        'Question-wise performance statistics',
        'Leaderboard for each round',
      ]}
      generateLabel="Generate Report"
      isPending={generateReportMutation.isPending}
      onGenerate={handleGenerate}
      headingTestId="heading-generate-event-report"
    >
      <div className="space-y-2">
        <Label htmlFor="event-select">Event</Label>
        {eventsLoading ? (
          <div className="text-sm text-gray-500" data-testid="loading-events">Loading events...</div>
        ) : !events || events.length === 0 ? (
          <div className="text-sm text-gray-500" data-testid="no-events">
            No events available. Please create an event first.
          </div>
        ) : (
          <Select value={selectedEventId} onValueChange={setSelectedEventId}>
            <SelectTrigger id="event-select" data-testid="select-event">
              <SelectValue placeholder="Select an event" />
            </SelectTrigger>
            <SelectContent>
              {events.map((event) => (
                <SelectItem key={event.id} value={event.id} data-testid={`option-event-${event.id}`}>
                  {event.name} ({event.type} - {statusLabel('event', event.status)})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>
    </ReportGenerateShell>
  );
}
