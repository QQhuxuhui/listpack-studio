/**
 * Shopify Admin GraphQL client.
 *
 * Bound to a single (shop, accessToken) pair. Cached on the workspace so
 * upstream code calls `getShopifyAdminClient(workspaceId)` and trusts
 * caching to skip re-decryption + re-construction.
 *
 * GraphQL endpoint: https://{shop}/admin/api/{version}/graphql.json
 */

import { decryptToken } from './crypto';
import { shopifyAdminApiVersion } from './oauth';

export interface ShopifyAdminClient {
  shop: string;
  query<T = unknown>(
    query: string,
    variables?: Record<string, unknown>,
  ): Promise<T>;
}

export interface BuildClientArgs {
  shop: string;
  encryptedAccessToken: string;
}

export function buildAdminClient({
  shop,
  encryptedAccessToken,
}: BuildClientArgs): ShopifyAdminClient {
  const accessToken = decryptToken(encryptedAccessToken);
  const endpoint = `https://${shop}/admin/api/${shopifyAdminApiVersion()}/graphql.json`;

  return {
    shop,
    async query<T = unknown>(
      query: string,
      variables: Record<string, unknown> = {},
    ): Promise<T> {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'X-Shopify-Access-Token': accessToken,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ query, variables }),
      });
      if (!res.ok) {
        const body = await res.text();
        throw new Error(
          `Shopify Admin GraphQL ${res.status}: ${body.slice(0, 200)}`,
        );
      }
      const json = (await res.json()) as {
        data?: T;
        errors?: { message: string; extensions?: unknown }[];
      };
      if (json.errors?.length) {
        throw new Error(
          `Shopify Admin GraphQL errors: ${json.errors.map((e) => e.message).join('; ')}`,
        );
      }
      if (!json.data) {
        throw new Error('Shopify Admin GraphQL returned empty `data`');
      }
      return json.data;
    },
  };
}

// ─── canned queries / mutations ──────────────────────────────────


/** Fetch the most recent N products. Cursor-paginated in v2. */
export const PRODUCTS_QUERY = /* GraphQL */ `
  query ListPackRecentProducts($first: Int!) {
    products(first: $first, sortKey: UPDATED_AT, reverse: true) {
      edges {
        node {
          id
          title
          handle
          status
          updatedAt
          featuredMedia {
            preview {
              image {
                url
              }
            }
          }
        }
      }
    }
  }
`;

export interface ProductsQueryResult {
  products: {
    edges: {
      node: {
        id: string;
        title: string;
        handle: string;
        status: 'ACTIVE' | 'ARCHIVED' | 'DRAFT';
        updatedAt: string;
        featuredMedia?: { preview?: { image?: { url: string } } };
      };
    }[];
  };
}


/**
 * Attach an image (already uploaded to a public-reachable URL) as media on
 * an existing product. This is the cheapest way to push a generated asset
 * — uploading the bytes themselves requires the `stagedUploadsCreate`
 * mutation (D27 v2).
 */
export const PRODUCT_CREATE_MEDIA_MUTATION = /* GraphQL */ `
  mutation ListPackProductCreateMedia(
    $productId: ID!
    $media: [CreateMediaInput!]!
  ) {
    productCreateMedia(productId: $productId, media: $media) {
      media {
        ... on MediaImage {
          id
          status
          image {
            url
          }
        }
      }
      mediaUserErrors {
        field
        message
      }
    }
  }
`;

export interface CreateMediaInput {
  alt?: string;
  mediaContentType: 'IMAGE' | 'VIDEO' | 'EXTERNAL_VIDEO' | 'MODEL_3D';
  originalSource: string; // public URL
}

export interface ProductCreateMediaResult {
  productCreateMedia: {
    media: { id: string; status: string; image?: { url: string } }[];
    mediaUserErrors: { field: string[]; message: string }[];
  };
}

/**
 * Convenience wrapper: attach one or more images by URL to a product.
 * Throws if Shopify returns any mediaUserErrors so the caller can surface
 * the failure to the user.
 */
export async function attachProductMedia(
  client: ShopifyAdminClient,
  productId: string,
  media: CreateMediaInput[],
): Promise<ProductCreateMediaResult['productCreateMedia']> {
  const data = await client.query<ProductCreateMediaResult>(
    PRODUCT_CREATE_MEDIA_MUTATION,
    { productId, media },
  );
  const result = data.productCreateMedia;
  if (result.mediaUserErrors.length > 0) {
    throw new Error(
      `Shopify productCreateMedia errors: ${result.mediaUserErrors
        .map((e) => `${e.field.join('.')}: ${e.message}`)
        .join('; ')}`,
    );
  }
  return result;
}
