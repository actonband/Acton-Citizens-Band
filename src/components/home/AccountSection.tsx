import React from "react";
import Section, { SectionProps } from "../Section";
import SignInForm from "../auth/SignInForm";
import { useAuth } from "../auth/AuthContext";

const AccountSection: React.FC<SectionProps> = ({ ...props }) => {
  const { user } = useAuth();

  return (
    <Section
      id={props.id}
      title={user && user.displayName ? "Welcome, " + user.displayName : "Account"}
      content={<SignInForm />}
      image={props.image}
      headerHeight={props.headerHeight}
    />
  );
};

export default AccountSection;
