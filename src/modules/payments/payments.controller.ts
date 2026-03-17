import {
  Controller,
  Post,
  Get,
  Body,
  Req,
  Res,
  UseGuards,
  HttpCode,
  HttpStatus,
  RawBodyRequest,
  Headers,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { PaymentsService } from './payments.service';
import { CreateSubscriptionDto } from './dto/create-subscription.dto';
import { CreateJobPaymentDto } from './dto/create-job-payment.dto';
import { ReleasePaymentDto } from './dto/release-payment.dto';
import { ValidatePromoDto } from './dto/validate-promo.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from '../users/schemas/user.schema';

interface JwtUser {
  sub: string;
  role: UserRole;
}

@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  // ── Validate promo (contractor, before checkout) ──
  @Post('validate-promo')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.CONTRACTOR)
  validatePromo(@Body() dto: ValidatePromoDto) {
    return this.paymentsService.validatePromoCode(dto.code, dto.plan);
  }

  // ── Contractor subscribes ──
  @Post('create-subscription')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.CONTRACTOR)
  createSubscription(
    @Body() dto: CreateSubscriptionDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.paymentsService.createSubscriptionCheckout(
      user.sub,
      dto.plan,
      dto.promoCodeId,
    );
  }

  // ── Contractor upgrades qualification ──
  @Post('upgrade-qualification')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.CONTRACTOR)
  upgradeQualification(@CurrentUser() user: JwtUser) {
    return this.paymentsService.createQualificationCheckout(user.sub);
  }

  // ── Client subscription ($10/week) ──
  @Post('create-client-subscription')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.CLIENT)
  createClientSubscription(@CurrentUser() user: JwtUser) {
    return this.paymentsService.createClientSubscriptionCheckout(user.sub);
  }

  // ── Client pays for a job (escrow) ──
  @Post('create-job-payment')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.CLIENT)
  createJobPayment(
    @Body() dto: CreateJobPaymentDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.paymentsService.createJobPayment(
      user.sub,
      dto.listingId,
      dto.contractorId,
      dto.amount,
    );
  }

  // ── Release escrow payment ──
  @Post('release-job-payment')
  @UseGuards(JwtAuthGuard)
  releaseJobPayment(
    @Body() dto: ReleasePaymentDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.paymentsService.releaseJobPayment(
      dto.transactionId,
      user.sub,
      user.role,
    );
  }

  // ── Get my transactions ──
  @Get('my-transactions')
  @UseGuards(JwtAuthGuard)
  getMyTransactions(@CurrentUser() user: JwtUser) {
    console.log('Getting transactions for user:', user.sub, 'Role:', user.role);
    return this.paymentsService.getMyTransactions(user.sub);
  }

  // ── Get contractor earnings ──
  @Get('contractor-earnings')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.CONTRACTOR)
  getContractorEarnings(@CurrentUser() user: JwtUser) {
    return this.paymentsService.getContractorEarnings(user.sub);
  }

  // ── Get subscription status ──
  @Get('subscription-status')
  @UseGuards(JwtAuthGuard)
  getSubscriptionStatus(@CurrentUser() user: JwtUser) {
    return this.paymentsService.getSubscriptionStatus(user.sub);
  }

  // ── Verify checkout session (manual activation for test mode) ──
  @Post('verify-session')
  @UseGuards(JwtAuthGuard)
  verifySession(@Body('sessionId') sessionId: string, @CurrentUser() user: JwtUser) {
    return this.paymentsService.verifyAndActivateSession(sessionId, user.sub);
  }

  // ── Stripe Webhook (no auth, verified by signature) ──
  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  async webhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature: string,
    @Res() res: Response,
  ) {
    const rawBody = req.rawBody;
    if (!rawBody) {
      res.status(400).json({ error: 'Missing raw body' });
      return;
    }

    try {
      await this.paymentsService.handleWebhook(rawBody, signature);
      res.json({ received: true });
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  }
}
