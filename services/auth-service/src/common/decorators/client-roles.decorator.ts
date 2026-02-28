import { SetMetadata } from '@nestjs/common';

export const CLIENT_ROLES_KEY = 'clientRoles';

export const ClientRoles = (client: string, ...roles: string[]) =>
  SetMetadata(CLIENT_ROLES_KEY, { client, roles });
