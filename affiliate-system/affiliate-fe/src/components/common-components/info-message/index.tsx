import Icon from '@components/core-components/icon';

interface InfoMessageProps {
  iconName?: string;
  text?: string;
  bgColor?: string;
  borderColor?: string;
}
function InfoMessage(props: InfoMessageProps) {
  const { iconName, text, bgColor, borderColor } = props;
  return (
    <>
      <div
        className={`flex w-fit py-3 px-5 justify-between ${
          bgColor || 'bg-gray-300'
        } rounded-[10px] border ${borderColor || 'border-gray-500'}`}
      >
        <div className="flex flex-row gap-3 items-center">
          <Icon iconName={iconName || 'alertGray'} svgProps={{ width: 26, height: 26 }} />
          <span className="text-xs font-bold text-gray-700">{text}</span>
        </div>
      </div>
    </>
  );
}

export default InfoMessage;
