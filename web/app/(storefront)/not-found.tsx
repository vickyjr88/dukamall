import { StorefrontNotFoundView } from '@/app/not-found-content';

// Reached when a storefront page calls notFound() (an unknown product slug).
// Renders inside StorefrontLayout, so the theme, header and footer are
// already around it.
export default function StorefrontNotFound() {
  return <StorefrontNotFoundView />;
}
