import React from "react";
import Section, { SectionProps } from "../Section";
import LoginForm from "../auth/LoginForm";
import { useAuth } from "../auth/AuthContext";

// TODO
  // - Implement firestore db to store user data
  // - Implement a form to update user data
  // - Implement a method do delete a user's account and data
  // - Implement a functionality to check if a user is a member of the band/junior band or just subscribed to alerts, etc.
  // - Use this? https://developers.google.com/identity/gsi/web/guides/display-button
  // - Create login and logout endpoints to use with firebase?
  // - Give click bait button for subscribing to practice cancellation notifications and then make them fill in member form to sign up

const AccountSection: React.FC<SectionProps> = ({ ...props }) => {
  const { user } = useAuth();

  return (
    <Section
      id={props.id}
      title={user && user.displayName ? "Welcome, " + user.displayName : "Account"}
      content={<LoginForm />}
      image={props.image}
      headerHeight={props.headerHeight}/>
  );
};

export default AccountSection;
