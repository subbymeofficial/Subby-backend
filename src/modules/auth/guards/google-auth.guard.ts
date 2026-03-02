import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { UserRole } from '../../users/schemas/user.schema';

type GoogleAuthIntent = 'login' | 'register';

@Injectable()
export class GoogleAuthGuard extends AuthGuard('google') {
  getAuthenticateOptions(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest<{
      query?: { role?: string; intent?: string };
    }>();

    const role =
      req.query?.role === UserRole.CONTRACTOR
        ? UserRole.CONTRACTOR
        : req.query?.role === UserRole.ADMIN
          ? UserRole.ADMIN
          : UserRole.CLIENT;

    const intent: GoogleAuthIntent =
      req.query?.intent === 'register' ? 'register' : 'login';

    return {
      // Helps users pick the right account every time
      prompt: 'select_account',
      // Round-trip context back to us in /google/callback
      state: JSON.stringify({ role, intent }),
    };
  }
}

