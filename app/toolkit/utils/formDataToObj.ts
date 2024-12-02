export const formDataToObject = (formData: FormData): Record<string, any> => {
  if (formData instanceof FormData) {
    let obj: Record<string, any> = {};
    for (let [key, value] of formData.entries()) {
      obj[key] = value;
    }
    return obj;
  }
  return formData;
};
