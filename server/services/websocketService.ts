import { io } from '../websocket';
import { storage } from '../storage';

export class WebSocketService {
  // Registration update - notify admins and registration committee
  static notifyRegistrationUpdate(eventId: string, registration: any) {
    if (!io) return;

    io.to('super_admin').emit('registrationUpdate', {
      type: 'new_registration',
      eventId,
      registration
    });
    io.to('registration_committee').emit('registrationUpdate', {
      type: 'new_registration',
      eventId,
      registration
    });
    io.to(`event:${eventId}`).emit('registrationUpdate', {
      type: 'new_registration',
      eventId,
      registration
    });
  }

  // Round status change - notify all participants of the event and admins
  static async notifyRoundStatus(eventId: string, roundId: string, status: string, round: any) {
    if (!io) return;

    io.to('super_admin').emit('roundStatus', {
      eventId,
      roundId,
      status,
      round
    });
    io.to(`event:${eventId}`).emit('roundStatus', {
      eventId,
      roundId,
      status,
      round
    });

    // Get all participants for this event and emit to each one individually
    const participants = await storage.getParticipantsByEventId(eventId);
    participants.forEach(participant => {
      io.to(`participant:${participant.id}`).emit('roundStatus', {
        eventId,
        roundId,
        status,
        round
      });
    });
  }

  // Super admin override - notify all admins and affected users
  static notifyOverrideAction(action: string, targetType: string, targetId: string, changes: any) {
    if (!io) return;

    io.to('super_admin').emit('overrideAction', {
      action,
      targetType,
      targetId,
      changes,
      timestamp: new Date()
    });
    // If it's an event override, notify event admins
    if (targetType === 'event') {
      io.to(`event:${targetId}`).emit('overrideAction', {
        action,
        targetType,
        targetId,
        changes,
        timestamp: new Date()
      });
    }
  }

  // Result published - notify specific participant
  static notifyResultPublished(participantId: string, eventId: string, result: any) {
    if (!io) return;

    io.to(`participant:${participantId}`).emit('resultPublished', {
      eventId,
      result
    });
  }

  // Broadcast to specific event participants
  static broadcastToEvent(eventId: string, event: string, data: any) {
    if (!io) return;
    io.to(`event:${eventId}`).emit(event, data);
  }

  // Broadcast to all super admins
  static broadcastToSuperAdmins(event: string, data: any) {
    if (!io) return;
    io.to('super_admin').emit(event, data);
  }

  // Registration confirmed - notify admins and participant
  static notifyRegistrationConfirmed(registration: any) {
    if (!io) return;

    io.to('super_admin').emit('registrationConfirmed', registration);
    io.to('registration_committee').emit('registrationConfirmed', registration);
    if (registration.eventId) {
      io.to(`event:${registration.eventId}`).emit('registrationConfirmed', registration);
    }
  }

  // Test submitted - notify admins and update leaderboard
  static notifyTestSubmission(data: {
    userId: string;
    roundId: string;
    eventId: string;
    attemptId: string;
    score?: number;
  }) {
    if (!io) return;

    io.to('super_admin').emit('testSubmitted', data);
    io.to(`event:${data.eventId}`).emit('testSubmitted', data);
  }

  // Credentials created - notify participant
  static notifyCredentialsCreated(participantId: string, eventId: string, credentials: any) {
    if (!io) return;

    io.to(`participant:${participantId}`).emit('credentialsCreated', {
      eventId,
      credentials
    });
  }
}
