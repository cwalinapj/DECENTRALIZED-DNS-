use clap::{Parser, Subcommand};

#[derive(Parser, Debug)]
#[command(name = "ddns-node", version, about = "DDNS Node Agent")]
pub struct Cli {
  #[command(subcommand)]
  pub command: Command,
}

#[derive(Subcommand, Debug)]
pub enum Command {
  /// Initialize config + keys
  Init {
    #[arg(long, default_value = "/etc/ddns-node/config.json")]
    config: String,
  },
  /// Run the node agent
  Run {
    #[arg(long, default_value = "/etc/ddns-node/config.json")]
    config: String,
  },
  /// Verify a receipt envelope from JSON
  VerifyReceipt {
    #[arg(long)]
    receipt: String,
  },
}
