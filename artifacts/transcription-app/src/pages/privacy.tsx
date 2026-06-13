import { useEffect } from "react";

/** Privacy is part of the unified Trust Center at /security#privacy-policy */
export default function Privacy() {
  useEffect(() => {
    window.location.replace("/security#privacy-policy");
  }, []);

  return null;
}
