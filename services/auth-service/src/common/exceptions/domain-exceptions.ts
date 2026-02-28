import { HttpException, HttpStatus } from '@nestjs/common';

export class BaseException extends HttpException {
  constructor(
    message: string,
    status: HttpStatus,
    public readonly errorCode?: string,
  ) {
    super(message, status);
  }
}

export class NotFoundException extends BaseException {
  constructor(resource: string, identifier?: string) {
    const message = identifier
      ? `${resource} with identifier '${identifier}' not found`
      : `${resource} not found`;
    super(message, HttpStatus.NOT_FOUND, 'NOT_FOUND');
  }
}

export class ConflictException extends BaseException {
  constructor(message: string) {
    super(message, HttpStatus.CONFLICT, 'CONFLICT');
  }
}

export class ForbiddenException extends BaseException {
  constructor(message = 'You do not have permission to perform this action') {
    super(message, HttpStatus.FORBIDDEN, 'FORBIDDEN');
  }
}

export class UnauthorizedException extends BaseException {
  constructor(message = 'Authentication required') {
    super(message, HttpStatus.UNAUTHORIZED, 'UNAUTHORIZED');
  }
}

export class ValidationException extends BaseException {
  constructor(message: string) {
    super(message, HttpStatus.BAD_REQUEST, 'VALIDATION_ERROR');
  }
}

export class ExternalServiceException extends BaseException {
  constructor(service: string, detail?: string) {
    const message = detail
      ? `External service '${service}' error: ${detail}`
      : `External service '${service}' is unavailable`;
    super(message, HttpStatus.BAD_GATEWAY, 'EXTERNAL_SERVICE_ERROR');
  }
}

export class TenantLimitExceededException extends BaseException {
  constructor(tenantName: string, limit: number) {
    super(
      `Tenant '${tenantName}' has reached the maximum user limit of ${limit}`,
      HttpStatus.FORBIDDEN,
      'TENANT_LIMIT_EXCEEDED',
    );
  }
}

export class InvitationExpiredException extends BaseException {
  constructor() {
    super(
      'This invitation has expired or is no longer valid',
      HttpStatus.GONE,
      'INVITATION_EXPIRED',
    );
  }
}
