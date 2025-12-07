import { createContext, useContext, useEffect, useRef, useState, ReactNode } from 'react';
import { io, Socket } from 'socket.io-client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/lib/auth';
import { queryClient } from '@/lib/queryClient';

interface WebSocketContextType {
  isConnected: boolean;
  socket: Socket | null;
}

const WebSocketContext = createContext<WebSocketContextType>({
  isConnected: false,
  socket: null
});

export function WebSocketProvider({ children }: { children: ReactNode }) {
  const [isConnected, setIsConnected] = useState(false);
  const socketRef = useRef<Socket | null>(null);
  const { toast } = useToast();
  const { user, token } = useAuth();

  useEffect(() => {
    if (!token || !user) {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
        setIsConnected(false);
      }
      return;
    }

    const socket = io(window.location.origin, {
      auth: { token },
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      setIsConnected(true);
      console.log('WebSocket connected');
    });

    socket.on('disconnect', () => {
      setIsConnected(false);
      console.log('WebSocket disconnected');
    });

    socket.on('connect_error', (error) => {
      console.error('WebSocket connection error:', error);
    });

    socket.on('registrationUpdate', (data) => {
      toast({
        title: 'New Registration',
        description: `New participant registered for ${data.registration?.eventName || 'an event'}`,
      });

      // Invalidate registration caches for instant UI update
      queryClient.invalidateQueries({ queryKey: ['/api/registrations'] });
      queryClient.invalidateQueries({ queryKey: ['/api/registrations/colleges'] });
    });

    socket.on('roundStatus', (data) => {
      toast({
        title: 'Round Status Update',
        description: `Round ${data.round?.name || 'round'} is now ${data.status}`,
      });

      // Invalidate round and event caches
      if (data.roundId) {
        queryClient.invalidateQueries({ queryKey: [`/api/rounds/${data.roundId}`] });
      }
      if (data.eventId) {
        queryClient.invalidateQueries({ queryKey: [`/api/events/${data.eventId}`] });
        queryClient.invalidateQueries({ queryKey: [`/api/events/${data.eventId}/rounds`] });
      }
    });

    socket.on('overrideAction', (data) => {
      toast({
        title: 'Admin Override',
        description: `${data.targetType} has been ${data.action}`,
        variant: 'destructive'
      });
    });

    socket.on('resultPublished', (data) => {
      toast({
        title: 'Results Published',
        description: 'Your test results are now available',
      });

      // Invalidate result and leaderboard caches
      if (data.eventId) {
        queryClient.invalidateQueries({ queryKey: [`/api/leaderboard/${data.eventId}`] });
      }
      queryClient.invalidateQueries({ queryKey: ['/api/test-attempts'] });
      queryClient.invalidateQueries({ queryKey: ['/api/results'] });
    });

    // Registration confirmed - invalidate caches
    socket.on('registrationConfirmed', (data) => {
      toast({
        title: 'Registration Confirmed',
        description: `${data.organizerName}'s registration has been confirmed`,
      });

      queryClient.invalidateQueries({ queryKey: ['/api/registrations'] });
      queryClient.invalidateQueries({ queryKey: ['/api/participants/my-credential'] });
    });

    // Test submitted - update leaderboard instantly
    socket.on('testSubmitted', (data) => {
      if (data.roundId) {
        queryClient.invalidateQueries({ queryKey: [`/api/leaderboard/${data.roundId}`] });
      }
      if (data.eventId) {
        queryClient.invalidateQueries({ queryKey: [`/api/leaderboard/${data.eventId}`] });
      }
      queryClient.invalidateQueries({ queryKey: ['/api/test-attempts'] });
    });

    // Credentials created - show instantly
    socket.on('credentialsCreated', (data) => {
      toast({
        title: 'Credentials Ready',
        description: 'Your event credentials are now available',
      });

      queryClient.invalidateQueries({ queryKey: ['/api/participants/my-credential'] });
    });

    return () => {
      socket.disconnect();
    };
  }, [toast, user, token]);

  return (
    <WebSocketContext.Provider value={{ isConnected, socket: socketRef.current }}>
      {children}
    </WebSocketContext.Provider>
  );
}

export function useWebSocket() {
  return useContext(WebSocketContext);
}
