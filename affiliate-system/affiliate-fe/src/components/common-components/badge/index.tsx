import React from 'react';

interface BadgeProps {
  count: number | string;
}

function Badge(props: BadgeProps) {
  const { count } = props;
  return (
    count && (
      <span
        style={{
          backgroundColor: '#F44336',
          color: '#fff',
          borderRadius: '10px',
          padding: '4px 8px',
          fontSize: '13px',
          fontWeight: 'bold',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minWidth: '20px',
        }}
      >
        {count}
      </span>
    )
  );
}

export default Badge;
