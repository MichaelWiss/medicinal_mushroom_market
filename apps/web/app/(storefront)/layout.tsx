import { Shell } from '@/components/shell/Shell';
import { TopbarChip, TopbarButton, TopbarCta } from '@/components/shell/Topbar';

export default function StorefrontLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Shell
      topbarTitle="Species catalogue"
      topbarRight={
        <>
          <TopbarChip>Next dispatch Mon 27 Apr</TopbarChip>
          <TopbarButton>Request quote</TopbarButton>
          <TopbarCta count={0}>Cart</TopbarCta>
        </>
      }
    >
      {children}
    </Shell>
  );
}
