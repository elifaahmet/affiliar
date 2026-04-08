const parseDate = (dateStr, isEnd = false) => {
        const [day, month, year] = dateStr.split("-");
        const date = new Date(`${year}-${month}-${day}T00:00:00`);
        if (isEnd) {
          date.setHours(23, 59, 59, 999);
        }
        return date;
      };

module.exports = parseDate;