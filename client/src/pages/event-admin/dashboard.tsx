import { useQuery } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { useAuth } from '@/lib/auth';
import EventAdminLayout from '@/components/layouts/EventAdminLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Settings, Play, Users, Calendar, Trophy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Event } from '@shared/schema';

interface MyEventResponse {
  event: Event;
  participantCount: number;
}

export default function EventAdminDashboard() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();

  const { data, isLoading } = useQuery<MyEventResponse>({
    queryKey: ['/api/event-admin/my-event'],
    refetchInterval: 3000, // Auto-refresh every 3 seconds for live updates
  });

  const { data: stats } = useQuery<{
    totalTeams: number;
    teamsPerEvent: { eventId: string; eventName: string; count: number }[];
    teamsPerCollege: { college: string; count: number }[];
  }>({
    queryKey: ['/api/event-admin/stats'],
    refetchInterval: 3000, // Auto-refresh every 3 seconds for live updates
  });

  if (isLoading) {
    return (
      <EventAdminLayout>
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Loading your event...</p>
          </div>
        </div>
      </EventAdminLayout>
    );
  }

  if (!data || !data.event) {
    return (
      <EventAdminLayout>
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center">
            <Calendar className="h-16 w-16 text-gray-400 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-gray-900 mb-2">No Event Assigned</h2>
            <p className="text-gray-600">You have not been assigned to any event yet.</p>
            <p className="text-gray-600 mt-1">Please contact your administrator.</p>
          </div>
        </div>
      </EventAdminLayout>
    );
  }

  const { event, participantCount } = data;

  return (
    <EventAdminLayout>
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-5xl mx-auto">
          {/* Header Section */}
          <div className="text-center mb-12">
            <h1
              className="text-3xl md:text-5xl font-bold text-gray-900 mb-4"
              data-testid="text-event-name"
            >
              {event.name}
            </h1>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">
              {event.description}
            </p>
            <div className="mt-6 inline-flex items-center px-4 py-2 rounded-full bg-indigo-100 text-indigo-800">
              <span className="text-sm font-medium">
                Status: <span className="font-bold capitalize">{event.status}</span>
              </span>
            </div>
          </div>

          {/* Stats Card */}
          <Card className="mb-8 border-2 shadow-lg">
            <CardHeader className="bg-gradient-to-r from-indigo-50 to-purple-50">
              <CardTitle className="flex items-center justify-center gap-2 text-2xl">
                <Users className="h-6 w-6 text-indigo-600" />
                <span>Participant Statistics</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="py-8">
              <div className="text-center">
                <div
                  className="text-6xl font-bold text-indigo-600 mb-2"
                  data-testid="text-participant-count"
                >
                  {participantCount}
                </div>
                <p className="text-xl text-gray-600">Total Participants</p>
              </div>
            </CardContent>
          </Card>

          {/* Action Buttons */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Manage Settings Button */}
            <Card
              className="cursor-pointer hover:shadow-2xl transition-all duration-300 transform hover:-translate-y-1 border-2 hover:border-indigo-400"
              onClick={() => setLocation(`/event-admin/events/${event.id}`)}
            >
              <CardContent className="p-8">
                <div className="text-center">
                  <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-gradient-to-br from-indigo-500 to-indigo-600 mb-6 shadow-lg">
                    <Settings className="h-10 w-10 text-white" />
                  </div>
                  <h3 className="text-2xl font-bold text-gray-900 mb-3">
                    Manage Settings
                  </h3>
                  <p className="text-gray-600 mb-6">
                    Configure event details, rules, and participant management
                  </p>
                  <Button
                    className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-6 text-lg font-semibold"
                    data-testid="button-manage-settings"
                  >
                    Open Settings
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Test Control Button */}
            <Card
              className="cursor-pointer hover:shadow-2xl transition-all duration-300 transform hover:-translate-y-1 border-2 hover:border-purple-400"
              onClick={() => setLocation(`/event-admin/events/${event.id}/rounds`)}
            >
              <CardContent className="p-8">
                <div className="text-center">
                  <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-gradient-to-br from-purple-500 to-purple-600 mb-6 shadow-lg">
                    <Play className="h-10 w-10 text-white ml-1" />
                  </div>
                  <h3 className="text-2xl font-bold text-gray-900 mb-3">
                    Test Control
                  </h3>
                  <p className="text-gray-600 mb-6">
                    Manage rounds, questions, and monitor test progress
                  </p>
                  <Button
                    className="w-full bg-purple-600 hover:bg-purple-700 text-white py-6 text-lg font-semibold"
                    data-testid="button-test-control"
                  >
                    Manage Tests
                  </Button>
                </div>
              </CardContent>
            </Card>


            {/* Results & Winners Button */}
            <Card
              className="cursor-pointer hover:shadow-2xl transition-all duration-300 transform hover:-translate-y-1 border-2 hover:border-yellow-400"
              onClick={() => setLocation(`/event-admin/events/${event.id}/results`)}
            >
              <CardContent className="p-8">
                <div className="text-center">
                  <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-gradient-to-br from-yellow-500 to-yellow-600 mb-6 shadow-lg">
                    <Trophy className="h-10 w-10 text-white ml-0.5" />
                  </div>
                  <h3 className="text-2xl font-bold text-gray-900 mb-3">
                    Results & Winners
                  </h3>
                  <p className="text-gray-600 mb-6">
                    Declare results, promote qualifiers, and announce winners
                  </p>
                  <Button
                    className="w-full bg-yellow-600 hover:bg-yellow-700 text-white py-6 text-lg font-semibold"
                    data-testid="button-results-control"
                  >
                    Manage Results
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Event Info Footer */}
          <div className="mt-8 text-center">
            <p className="text-sm text-gray-500">
              Event Type: <span className="font-semibold capitalize">{event.type}</span>
              {' • '}
              Category: <span className="font-semibold capitalize">{event.category.replace('_', ' ')}</span>
            </p>
          </div>
          <div className="mt-12">
            <h2 className="text-xl font-bold mb-4 text-center">Event Analytics</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Teams Overview</CardTitle>
                </CardHeader>
                <CardContent>
                  {stats?.teamsPerEvent && stats.teamsPerEvent.length > 0 ? (
                    <div className="space-y-2">
                      {stats.teamsPerEvent.map((stat) => (
                        <div key={stat.eventId} className="flex justify-between items-center border-b pb-2 last:border-0">
                          <span className="font-medium">{stat.eventName}</span>
                          <span className="bg-indigo-100 text-indigo-700 px-2 py-1 rounded text-sm font-bold">{stat.count}</span>
                        </div>
                      ))}
                      <div className="pt-2 flex justify-between items-center border-t mt-2">
                        <span className="font-bold">Total Teams</span>
                        <span className="font-bold text-lg">{stats.totalTeams}</span>
                      </div>
                    </div>
                  ) : (
                    <p className="text-gray-500 text-sm">No registrations found.</p>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">College Distribution</CardTitle>
                </CardHeader>
                <CardContent className="max-h-[300px] overflow-y-auto">
                  {stats?.teamsPerCollege && stats.teamsPerCollege.length > 0 ? (
                    <div className="space-y-2">
                      {stats.teamsPerCollege.map((stat, idx) => (
                        <div key={idx} className="flex justify-between items-center border-b pb-2 last:border-0">
                          <span className="truncate max-w-[70%] text-sm" title={stat.college}>{stat.college}</span>
                          <span className="bg-purple-100 text-purple-700 px-2 py-1 rounded text-sm font-bold">{stat.count}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-gray-500 text-sm">No college data available.</p>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>
    </EventAdminLayout >
  );
}
