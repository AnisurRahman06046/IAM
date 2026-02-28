import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

export enum OtpPurpose {
  LOGIN_MFA = 'login_mfa',
  PASSWORD_RESET = 'password_reset',
  PHONE_VERIFY = 'phone_verify',
}

@Entity('otp_records')
export class OtpRecord {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_identifier' })
  userIdentifier: string;

  @Column({ name: 'otp_hash' })
  otpHash: string;

  @Column({ type: 'enum', enum: OtpPurpose })
  purpose: OtpPurpose;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt: Date;

  @Column({ default: false })
  verified: boolean;

  @Column({ default: 0 })
  attempts: number;

  @Column({ name: 'max_attempts', default: 5 })
  maxAttempts: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
