{
  inputs = {
    devshell = {
      url = "github:numtide/devshell";
      inputs = {
        flake-utils.follows = "utils";
        nixpkgs.follows = "nixpkgs";
      };
    };
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    rust.url = "github:oxalica/rust-overlay";
    utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, devshell, utils, nixpkgs, rust }:
    utils.lib.eachDefaultSystem (system:
      let
        pkgs = import nixpkgs {
          inherit system;
          overlays = [
            devshell.overlays.default
            rust.overlays.default
          ];
        };
        rust-toolchain = toml: (pkgs.rust-bin.fromRustupToolchainFile toml).override {
          targets = [ "wasm32-unknown-unknown" ];
        };
      in
      {
        devShells.lockfile = pkgs.devshell.mkShell {
          devshell = {
            packages = [ (rust-toolchain ./core/lockfile/rust-toolchain.toml) ];
          };
          commands = [
            {
              name = "build";
              command = "deno task build";
            }
          ];
        };
      });
}
