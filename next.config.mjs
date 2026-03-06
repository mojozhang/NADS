/** @type {import('next').NextConfig} */
const nextConfig = {
    experimental: {
        serverActions: {
            bodySizeLimit: '20mb',
        },
        serverComponentsExternalPackages: ['pdfjs-dist', 'canvas'],
    },
};

export default nextConfig;
