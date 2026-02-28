import { Product } from '../../database/entities/product.entity';

/**
 * SECURITY: Strips sensitive fields (Keycloak secrets, internal UUIDs)
 * from product entity before returning in API responses.
 */
export class ProductResponseDto {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  frontendUrl: string | null;
  backendUrl: string | null;
  backendPort: number | null;
  kcPublicClientId: string | null;
  kcBackendClientId: string | null;
  apisixRouteId: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;

  static from(product: Product): ProductResponseDto {
    const dto = new ProductResponseDto();
    dto.id = product.id;
    dto.name = product.name;
    dto.slug = product.slug;
    dto.description = product.description;
    dto.frontendUrl = product.frontendUrl;
    dto.backendUrl = product.backendUrl;
    dto.backendPort = product.backendPort;
    dto.kcPublicClientId = product.kcPublicClientId;
    dto.kcBackendClientId = product.kcBackendClientId;
    dto.apisixRouteId = product.apisixRouteId;
    dto.status = product.status;
    dto.createdAt = product.createdAt;
    dto.updatedAt = product.updatedAt;
    // EXCLUDED: kcPublicClientUuid, kcBackendClientUuid, kcBackendClientSecret
    return dto;
  }

  static fromMany(products: Product[]): ProductResponseDto[] {
    return products.map(ProductResponseDto.from);
  }
}
