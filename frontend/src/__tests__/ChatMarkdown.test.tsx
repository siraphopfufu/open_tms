import { render, screen } from '@testing-library/react';
import { ChatMarkdown, parseBlocks } from '../components/ChatMarkdown';

describe('ChatMarkdown', () => {
  it('renders bold, bullets and numbered lists as elements, not asterisks', () => {
    const { container } = render(
      <ChatMarkdown text={'**วันนี้ไม่มีงานใหม่**\n\nตู้ที่ยังไม่จัดรถ:\n- **WID-1** ตู้ TGHU6837497\n- WID-2\n\n1. เปิดงาน\n2. กดจัดรถ'} />,
    );
    expect(screen.getByText('วันนี้ไม่มีงานใหม่').tagName).toBe('STRONG');
    expect(container.querySelectorAll('ul > li')).toHaveLength(2);
    expect(container.querySelectorAll('ol > li')).toHaveLength(2);
    expect(container.textContent).not.toContain('**');
  });

  it('keeps line breaks inside a paragraph', () => {
    const { container } = render(<ChatMarkdown text={'บรรทัดแรก\nบรรทัดสอง'} />);
    expect(container.querySelectorAll('p br')).toHaveLength(1);
  });

  it('never interprets HTML in model output', () => {
    const { container } = render(<ChatMarkdown text={'<img src=x onerror="alert(1)"> **ok**'} />);
    expect(container.querySelector('img')).toBeNull();
    expect(container.textContent).toContain('<img src=x onerror="alert(1)">');
  });

  it('drops heading markers and empty blocks', () => {
    expect(parseBlocks('## สรุป\n\n\n- a')).toEqual([
      { kind: 'p', lines: ['สรุป'] },
      { kind: 'ul', items: ['a'] },
    ]);
  });
});
